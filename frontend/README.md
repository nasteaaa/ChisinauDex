# Frontend

The web app: React 19 with Vite, Tailwind, React Router, TanStack Query and i18next.

- `src/pages/`: the home page (assistant), About, Privacy, the accessibility statement.
- `src/features/`: the bigger pieces: the assistant and its answer view, the address panel, the document browser, the staff dashboard and the 3D city map.
- `src/components/`: the layout, footer, cookie banner and accessibility panel.
- `src/lib/`: the API client, user preferences, consent-based analytics, speech helpers and formatting.
- `src/locales/`: every piece of text, in Romanian, Russian and English. New text goes into all three files.
- `src/index.css`: the colour palette and the accessibility modes (high contrast, colour-blind, readable font).

In development Vite forwards `/api` to the backend on port 3000. In production set `VITE_API_URL` to the backend's address.
