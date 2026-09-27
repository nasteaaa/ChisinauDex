# Backend

A Fastify server in TypeScript. It loads the scraped pages from `data/`, builds the keyword index in memory and the vector index in Postgres (pgvector) when it starts, and serves the API the web app uses.

Where things live:

- `src/corpus/`: the list of the 41 official sources, text normalisation (Romanian diacritics, Russian keywords), the search index and the example questions.
- `src/assistant/`: the answer pipeline. It finds passages, asks the AI model to connect them (or picks quotes directly when there's no key), checks every quote against its source and decides the status of the answer.
- `src/live/`: lookups for one address: geocoding through OpenStreetMap, water outages from Apă-Canal, live buses and the family-doctor lists.
- `src/routes/`: the HTTP endpoints. The folder name is the URL, so `routes/api/ask` is `/api/ask`.
- `src/plugins/`: things every route needs: security headers, CORS, rate limiting, validation, error handling and loading the corpus.
- `src/db/`: the Postgres connection (Railway via `DATABASE_URL`, otherwise PGlite in `data/runtime/pg`) and the schema: chunks, embeddings, answer cache, events, page versions, and the `unanswered` view.
- `src/store/`: usage logs (questions, ratings, staff actions), stored in Postgres and mirrored to append-only JSONL files in `data/runtime/`, from which an empty database is rebuilt.
- `scripts/crawl.ts`: the crawler that refreshes `data/corpus.json`, `health.json` and `conflicts.json`. For the two JavaScript apps it reads e-Grădiniță's public kindergarten list and the Google Docs guides both apps publish; nothing behind a login.

Commands: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm crawl`.

Settings are read from environment variables and validated in `src/config.ts`. `DATABASE_URL` points at Postgres with pgvector (optional locally). `AI_API_KEY` is a Groq key and `AI_MODELS` the models to use, best first (when one reaches its daily free-tier limit, the next one answers). Everything works without a key.
