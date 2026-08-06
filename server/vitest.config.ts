import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The env module exits the process on invalid config, so tests get a
    // complete, obviously-fake set rather than whatever the shell happens to have.
    env: {
      NODE_ENV: 'test',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_ANON_KEY: 'test-anon-key-000000000000',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-000000',
      STRIPE_SECRET_KEY: 'sk_test_000000000000',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_000000000000',
      CORS_ORIGINS: 'http://localhost:8081',
    },
  },
});
