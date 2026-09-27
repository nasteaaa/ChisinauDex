# Project context

Hackathon project for DeepTech GigaHack 2026. Team: 1 PO, 1 Designer, 1 developer (frontend-first, full-stack lead).
Challenge: **Smart City (Chișinău City Hall)**: municipal AI assistant "ChisinauDex" answering only from the official sites in Annex 1, with exact citations, contradiction/gap flags and routing to the responsible institution.

Hard deadline: final upload Sun 27 Sep 2026 14:55. Optimise for a working, deployed demo.

## Stack
- `frontend/`: Vite + React 19 + TS, Tailwind v4 (ChisinauDex palette tokens in `src/index.css`), React Router (declarative), TanStack Query, react-i18next (ro default, ru, en).
- `backend/`: Fastify 5 (`src/plugins` and `src/routes` are auto-loaded; folder = URL prefix), Zod via fastify-type-provider-zod, CommonJS. The scraped corpus is `backend/data/*.json` (built by `pnpm --filter backend crawl`). Postgres + pgvector (`src/db`; PGlite locally, Railway in production) holds chunk embeddings, the answer cache, usage logs and page versions.
- pnpm 11 workspace. Public npm registry is pinned in `.npmrc`.

## Conventions
- New endpoint: copy `backend/src/routes/api/feedback/index.ts`. Always declare Zod `body`/`response` schemas.
- Real data only: everything shown must come from the Annex 1 sources or real usage. No mock content.
- New UI feature: `frontend/src/features/<name>/` with `api.ts` (query hooks) + components.
- All user-facing text goes through `t()`, with keys in all 3 locale files.
- Env: validate in `backend/src/config.ts`. Frontend only sees `VITE_*` (public, never secrets).
- Verify with `pnpm check` before pushing.

## AI
- The model (Grok or Groq, chosen by the `AI_API_KEY` prefix) is called only from the backend (`backend/src/assistant/llm.ts`); the key lives in `backend/.env` and is validated in `config.ts`.
- The model may only connect quotes. Every quote is checked against its source before it is shown, and sentences without a verified quote are dropped.
- Without a key the no-AI path answers with quotes picked directly from the documents and a live search of the official sites. Keep that path working; it is also the fallback when the API fails.
