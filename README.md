# Hacker Dojo

The member platform for Hacker Dojo — one React Native codebase for iOS and
Android, an Express API, and a Supabase data plane.

Members use it to get through the front door, see how busy the space is, book
the laser cutter, find who is on the floor, RSVP to events, and pay for their
membership. Prospective members use the same app to browse events, look at the
equipment list and book a tour.

---

## Layout

```
mobile/     Expo app (iOS + Android) — Expo Router, Tamagui, React Query, Zustand
server/     Express API — TypeScript, Zod, Pino, Stripe
supabase/   Migrations, RLS policies, storage buckets, seed data
```

## Architecture

Layers run one way. Nothing skips a step, and nothing calls back upward.

```
Screens (app/)              Route files. Presentation only.
  ↓
Feature hooks               React Query + mutations. Cache policy lives here.
  ↓
Feature API (features/*/api)  URLs and types. No fetch plumbing.
  ↓
API client (services/api)   Auth header, refresh, retry, timeout, error mapping.
  ↓ ── HTTPS ──
Routes (server/routes)      Middleware chain = the access-control statement.
  ↓
Controllers                 Read request → call one service → shape response.
  ↓
Services                    ALL business logic. No HTTP, no SQL.
  ↓
Repositories                The only code that touches Supabase.
  ↓
Postgres + RLS              The final authority on who may read or write what.
```

**Business logic is never in the app.** Prices, capacity, booking rules, and
membership state are decided server-side. The client renders what it is told
and asks for what it wants; it never computes an amount to charge or decides
that someone is a member.

### Three rules that shape everything else

**1. The database is the authority, not the API.**

Row Level Security is on for every table, and the API's service-role key is
confined to `server/src/repositories/**` (enforced by ESLint). The hard
guarantees are expressed as constraints rather than as checks in a service:

- Double-booking is impossible because of a GiST exclusion constraint over a
  `tstzrange`, not because a service counts rows first. Check-then-insert loses
  the race; the constraint cannot.
- Event capacity is enforced by a trigger inside the same transaction as the
  RSVP, which downgrades an over-capacity `going` to `waitlisted`.
- A member cannot promote themselves: the `profiles` update policy pins `role`
  to its current value.

`server/src/utils/postgrest.ts` turns the resulting SQLSTATEs into sentences a
member can act on.

**2. Server state lives in React Query. Zustand holds UI state only.**

Events, bookings, the directory and the profile are all React Query. The Zustand
store holds the appearance override, filter selections and the onboarding flag —
things the server has no opinion about. Nothing is duplicated across the two.

**3. Secrets have exactly one home.**

| Value                         | Where it lives     | Why                          |
| ----------------------------- | ------------------ | ---------------------------- |
| Supabase **anon** key         | mobile bundle      | Safe — RLS is the protection |
| Supabase **service-role** key | `server/.env` only | Bypasses RLS entirely        |
| Stripe **publishable** key    | mobile bundle      | Designed to be public        |
| Stripe **secret** key         | `server/.env` only | Can charge anyone            |

Payment Intents are created server-side from the plan record. The client sends a
plan id and a period — never an amount.

---

## Getting started

Node 22+ and npm 11+.

```bash
npm install

cp server/.env.example server/.env      # fill in Supabase + Stripe
cp mobile/.env.example mobile/.env      # public values only
```

### Database

```bash
supabase start
supabase db reset          # applies migrations, then seed.sql
```

### API

```bash
npm run server             # http://localhost:4000
```

Stripe webhooks in development:

```bash
stripe listen --forward-to localhost:4000/webhooks/stripe
# paste the whsec_… it prints into server/.env
```

### App

```bash
npm run mobile
```

On a physical device set `EXPO_PUBLIC_API_BASE_URL` to your machine's LAN IP —
`localhost` on a phone means the phone.

The script raises Node's heap to 8 GB. Metro accumulates memory per bundle and
does not give it back, so a long session — a few hundred rebuilds — exhausts the
4 GB default and dies with `Ineffective mark-compacts near heap limit`. The
larger ceiling delays that rather than curing it; if it still happens, restart
the dev server.

Native modules (Stripe, Secure Store, Apple Authentication) need a development
build rather than Expo Go:

```bash
npm run build:dev --workspace mobile
```

---

## Checks

```bash
npm run typecheck    # both workspaces, strict
npm run lint
npm test             # vitest (server) + jest (mobile)
npm run format
```

Husky runs `lint-staged` on commit and `typecheck` on push.

---

## Platform behaviour

Where the platforms differ, each one follows its own guidance rather than being
forced to match:

|               | iOS                                           | Android                                    |
| ------------- | --------------------------------------------- | ------------------------------------------ |
| Tab bar       | 56pt, small label under a scaled icon         | 64dp, Material 3 tinted pill, brand ripple |
| Sheets        | `formSheet` with grabber and swipe-to-dismiss | Bottom sheet, same gesture                 |
| Sign-in       | Apple's own button (App Store guideline 4.8)  | Google, via Custom Tabs                    |
| Wallet        | Apple Pay                                     | Google Pay                                 |
| Notifications | Permission prompt on first opt-in             | Channels + runtime permission              |
| Back          | Edge swipe                                    | Predictive back gesture                    |

Shared regardless: 48pt minimum tap targets (satisfies HIG's 44 and Material's
48), Dynamic Type / font scaling, VoiceOver and TalkBack labels on every
interactive element, and a Reduce Motion path for every animation.

---

## Deployment

```bash
npm run build:preview --workspace mobile     # internal distribution
npm run build:prod --workspace mobile        # App Store / Play Store
npm run update --workspace mobile            # OTA, JS-only changes
```

Before the first submission, fill in the placeholders in `mobile/eas.json`
(`ascAppId`, `appleTeamId`, the Play service-account path) and set
`EAS_PROJECT_ID`.

The API is a stateless container: `npm run build && npm start`. It answers
`GET /health`, handles `SIGTERM` by draining in-flight requests, and expects
`TRUST_PROXY_HOPS` to match your load balancer.

---

## Design

The visual system is Nocturne (the `_ds/nocturne-…` package in the Claude Design
project) with the Hacker Dojo brand layer over it. Every colour, space, radius
and type size is transcribed once into
[`mobile/src/theme/tokens.ts`](mobile/src/theme/tokens.ts) and reaches
components through Tamagui's theme layer. Nothing below the theme hard-codes a
hex or a pixel.

Both appearances are real. Nocturne is natively dark; the Dojo layer inverts the
ground to white and swaps the blurple accent for the brand red. The app follows
the OS setting by default and honours an explicit override from Settings.
