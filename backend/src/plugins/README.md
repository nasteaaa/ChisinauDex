# Plugins

Everything here is loaded automatically before the routes and applies to the whole app:

- `security.ts`: security headers, the CORS allow-list and rate limiting.
- `zod.ts`: request and response validation with Zod.
- `errors.ts`: consistent error responses that never leak internal details.
- `sensible.ts`: small helpers such as `reply.notFound()`.
- `corpus.ts`: loads `data/*.json` and builds the search index at startup.
