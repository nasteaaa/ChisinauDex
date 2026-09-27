# Routes

Each folder is loaded automatically and its path becomes the URL prefix, so `api/ask/index.ts` serves `/api/ask`. Every endpoint declares Zod schemas for what it accepts and returns.

| Endpoint | Used for |
|---|---|
| `POST /api/ask`, `POST /api/ask/stream` | Answer a question; the stream version reports each stage as it happens |
| `GET /api/documents`, `GET /api/documents/:id` | The document browser and document pages |
| `GET /api/examples`, `GET /api/suggest` | Example questions and search suggestions |
| `GET /api/live`, `POST /api/live/reverse` | Address information and "use my location" |
| `GET /api/sources` | The official sources and their health |
| `GET /api/route` | Staff internal assistant: situation → responsible institution |
| `GET /api/dashboard`, `POST /api/dashboard/action` | Staff dashboard |
| `POST /api/feedback`, `POST /api/events`, `POST /api/reports` | Ratings, consented analytics, accessibility reports |
| `GET /health` | Health check for the hosting platform |
