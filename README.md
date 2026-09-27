# ChisinauDex

Our entry for the Smart City track (Chișinău City Hall) at [DeepTech GigaHack 2026](https://gigahack.md/).

People in Chișinău waste a lot of time hunting for simple answers: how to enrol a child in kindergarten, who fixes the lift, whether there is water on their street today. The information exists, but it is spread over some forty municipal websites, often buried in news posts and PDFs. ChisinauDex puts one question box on top of all of it.

The rule we built everything around: **the assistant never answers from memory.** Every sentence it shows is backed by an exact quote from an official page, with a link to the source. If the documents don't say, it tells you so and points you to the institution that should know. If two documents disagree, it shows both instead of picking one.

## What it does

- **Answers in Romanian, Russian and English**, built only from quotes found on the 41 official sites listed in the challenge (City Hall, general directorates, municipal companies, district halls, schools, clinics).
- **Flags contradictions and missing information**, and drafts a petition when nothing is found.
- **Sends you to the right office**: every answer ends with the responsible institution and its contact page.
- **Knows your address** if you want it to: water outages on your street (Apă-Canal), your family doctor (clinic lists) and buses nearby (Parcul Urban de Autobuze, live).
- **Kindergartens and school admission**: the public e-Grădiniță list (all 131 municipal kindergartens with address, language, places and catchment streets) and the e-Grădiniță / e-Școala guides are searchable, and enrolment questions point to the platform where you apply.
- **Document browser** over everything we indexed, filterable by date, domain, source and type.
- **Staff view** for City Hall employees: an internal assistant that routes a situation to the right institution, plus a dashboard with contradictions, unanswered questions, hacked or broken pages on the city's sites, answer ratings and usage stats.
- **Accessible by default**: keyboard navigation, screen-reader friendly, high-contrast and colour-blind modes, larger text, voice input, and answers read aloud.

It works without an AI key too: it then shows the most relevant quotes directly, taken from the documents and from a live search of the official sites. With a Groq API key, the model writes a short plain-language answer, but it is only allowed to connect quotes, and every quote is checked word for word against the source before it is shown.

## Running it locally

You need Node 22 and pnpm 11 (`corepack enable` sets it up).

```bash
pnpm install
cp backend/.env.example backend/.env   # optional: put your Groq key in AI_API_KEY
pnpm dev
```

The app runs at http://localhost:5173 and the API at http://localhost:3000. The scraped data is already in `backend/data/`, so you don't need to crawl anything first.

Useful commands:

| Command | What it does |
|---|---|
| `pnpm dev` | Frontend and backend with hot reload |
| `pnpm check` | Lint, build and tests; run it before pushing |
| `pnpm --filter backend crawl` | Re-scrape the official sites (takes a few minutes) |
| `pnpm --filter backend crawl --conflicts` | Re-run only the contradiction scan |
| `pnpm --filter backend embed` | Build the vector index and exit (the server also does it at startup) |

## How it's put together

- `frontend/`: React 19, Vite, Tailwind, React Router, TanStack Query, i18next.
- `backend/`: Fastify with TypeScript and Zod, the answer pipeline (RAG), live address lookups and the crawler.
- **Postgres + pgvector** holds the chunks and their embeddings, the answer cache, usage logs, unanswered questions and the history of every page version. Locally it runs as PGlite (Postgres in WebAssembly, nothing to install); in production it's a Railway Postgres.

How an answer is built:

1. The crawler splits every page and PDF into chunks. Each chunk is embedded once with a local multilingual model (multilingual-e5-small), keyed by the hash of its text, so after a nightly crawl only the chunks that changed are embedded again.
2. A question is searched two ways: by meaning (pgvector cosine similarity, which also matches a Russian question to Romanian documents) and by keywords (BM25, for names and numbers). The two rankings are merged (reciprocal rank fusion), at most 2 chunks per document.
3. The top 5 chunks go to the model with their metadata (institution, date, authority). It may only connect exact quotes, in the language of the question; every quote is checked against the chunk before it is shown.
4. The answer is stored under a key made of the question, its filters and the corpus version: the same question gets the same answer, until the next crawl.

GitHub Actions runs lint, build, tests and a Docker build on every push, and re-crawls the official sites every night, committing the new snapshot when something changed.

## Deploying

The frontend is a static site and goes on **Vercel**. The backend streams answers, so it runs as a normal long-running server on **Railway** (the root `Dockerfile`). Postgres + pgvector is a separate managed database: **Neon**'s free tier is enough (the data is about 80 MB).

Indexing and serving are split, as usual for RAG: embedding all chunks needs about 3 GB of memory, so it runs as a job (`pnpm --filter backend embed`: from a laptop once, then after every nightly crawl in GitHub Actions). The web server only embeds the questions and stays at about 750 MB. Locally, without `DATABASE_URL`, the server uses an embedded Postgres (PGlite) and builds the index itself.

**Database (Neon):** create a free project and copy its connection string (pgvector needs no setup: the backend runs `CREATE EXTENSION vector`). Build the index once from your laptop: `DATABASE_URL=<connection string> pnpm --filter backend embed` (about 5 minutes).

**Backend (Railway):** create a project from this repo and leave the root directory empty: Railway builds the `Dockerfile` at the repo root (`railway.json` says so too). Set `DATABASE_URL`, `AI_API_KEY` (Groq), optionally `AI_MODELS` (models to use, best first), `PORT=3000` and `CORS_ORIGINS` (the Vercel URL). Optionally add a volume at `/app/data/runtime` (with `RAILWAY_RUN_UID=0`) to cache the embedding model between deploys. Generate a domain and check that `/health` shows `"ready":true`.

**Deploys:** the "Deploy backend" workflow deploys to Railway after CI passes on `main`; it needs a Railway project token as the `RAILWAY_TOKEN` secret.

**Frontend (Vercel):** import the repo with `frontend` as the root directory and set `VITE_API_URL` to the Railway URL. Redeploy after changing it, since Vite bakes it in at build time.

**Nightly crawl:** add `DATABASE_URL` as a repository secret so new pages are embedded after each crawl, and optionally `AI_API_KEY` for the contradiction scan.

## Team

Built in 48 hours by a product owner, a designer and a developer.
