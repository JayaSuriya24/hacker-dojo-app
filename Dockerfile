# =============================================================================
# Hacker Dojo API — production image.
#
# Three stages so the production dependency tree is built in ISOLATION and
# never sees a devDependency. The alternative (install everything, build, then
# `npm prune --omit=dev`) reaches a similar place by subtraction; this reaches
# it by construction, and the runtime tree is never contaminated in the first
# place.
#
# Every npm invocation below is scoped with `--workspace server`, which is what
# keeps the Expo/React Native toolchain out of the image: the root
# package.json declares both workspaces, and an unscoped install would resolve
# mobile's dependencies too.
# =============================================================================

# Pinned to the patch, not `node:22`. Two reasons: reproducibility, and the
# fact that `engines` allows Node 22.0–22.6, where ES module syntax detection
# does not exist. `-slim` (glibc) rather than Alpine (musl): the dependency
# tree is pure JavaScript today, but the first native module someone adds
# would fail to build on Alpine without a toolchain.
ARG NODE_IMAGE=node:22.20.0-bookworm-slim


# -----------------------------------------------------------------------------
# Stage 1 — deps: the production dependency tree, and nothing else.
# -----------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps

WORKDIR /app

# Manifests only. `npm ci` resolves the whole tree from the lockfile, so no
# source is needed here — and keeping source out means a code change does not
# invalidate this layer.
#
# mobile/package.json is deliberately NOT copied: `npm ci` installs from the
# lockfile and never re-reads workspace manifests, verified for both the scoped
# and unscoped forms.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json

# `--ignore-scripts` is safe here, and it was checked rather than assumed: of
# the 116 packages in the server's production tree, NONE declares preinstall,
# install or postinstall, and none is a node-gyp package. The `prepare` and
# `prepack` entries that some of them carry (stripe, express-rate-limit, qs)
# are not executed by npm for registry tarballs.
#
# It also settles the root `"prepare": "husky"` script, which otherwise runs
# during install and fails with exit 127 — husky is a devDependency that
# `--omit=dev` has just removed.
RUN npm ci --omit=dev --ignore-scripts --workspace server


# -----------------------------------------------------------------------------
# Stage 2 — build: compile TypeScript. Discarded once dist/ is extracted.
# -----------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build

WORKDIR /app

# NODE_ENV is deliberately NOT set to production in this stage. npm treats that
# as `--omit=dev`, which would remove the TypeScript compiler this stage exists
# to run.

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json

# Full tree, devDependencies included — `tsc` lives there.
RUN npm ci --ignore-scripts --workspace server

# Source and tsconfig come AFTER the install so editing a .ts file reuses the
# cached dependency layer above.
COPY server/tsconfig.json server/tsconfig.build.json ./server/
COPY server/src ./server/src

# tsconfig.build.json excludes **/*.test.ts and **/__tests__/**, so no test
# file reaches dist/.
RUN npm run build --workspace server


# -----------------------------------------------------------------------------
# Stage 3 — runner: the shipped image.
# -----------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner

# Read by config/env.ts. It selects the production logging path (no pino-pretty
# transport) and turns on the strict production configuration checks.
ENV NODE_ENV=production

WORKDIR /app

# Owned by `node` on arrival rather than chowned afterwards, which would
# duplicate the whole 45 MB tree into a second layer.
#
# npm hoists workspace dependencies to the root, so this single directory is
# the entire runtime tree — there is no server/node_modules.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# The compiled application.
COPY --from=build --chown=node:node /app/server/dist ./server/dist

# Required. It carries `"type": "module"`, which is what makes Node treat the
# emitted .js files as ES modules. Node 22.7+ would infer it from the `import`
# syntax, but `engines` permits 22.0–22.6, where that detection does not exist
# — so this is the difference between a declared contract and a fallback.
#
# The ROOT package.json is deliberately absent: nothing in the runtime needs
# it. Bare specifiers resolve by walking up to /app/node_modules, which does
# not consult a manifest. Verified by running this exact layout without it.
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json

# Present in the base image as uid/gid 1000. Nothing here is written at
# runtime, so read-only ownership is all that is required.
USER node

# Documentation only. The listener binds `env.PORT` (default 4000) and takes no
# host argument, so it listens on all interfaces and PORT continues to govern.
EXPOSE 4000

# `fetch` is global from Node 18, so this needs neither curl nor wget — neither
# of which exists in the slim image. Honours PORT for the same reason the app
# does. `--start-period` gives startup dependency verification room to run
# before a failure counts against the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Exec form, and `node` directly rather than `npm start`.
#
# This is load-bearing, not stylistic. `npm start` would run the server as a
# CHILD of npm, and npm does not reliably forward SIGTERM — which would strand
# the graceful-shutdown handlers in index.ts, skip the connection drain, and
# discard the exit codes that let an orchestrator tell a fatal startup failure
# apart from a deliberate stop. Exec form makes node itself PID 1, so the
# signal arrives where the handlers are.
CMD ["node", "server/dist/index.js"]
