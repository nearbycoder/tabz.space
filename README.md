# tabz.space

A fast, customizable start page: boards → groups → bookmarks in a drag-and-drop grid, a search box that searches the web *and* your bookmarks, and a browser extension to save pages in one click.

**Stack:** TanStack Start (React 19, SSR, server functions) · Drizzle ORM on SQLite (libSQL) · Effect for server/network code · Better Auth (username/email + password, optional GitHub) · Tailwind CSS v4 · dnd-kit.

## Develop

```sh
npm install
cp .env.example .env.local   # then edit
npm run db:migrate
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on :3000 |
| `npm run build` / `npm start` | Production build; `start` applies migrations, then boots the server |
| `npm run db:generate` | Generate a migration after editing `src/db/*schema.ts` |
| `npm run typecheck` / `npm run check` | TypeScript / Biome |

## Environment

| Variable | Notes |
| --- | --- |
| `DATABASE_PATH` | SQLite file (default `./data/tabz.db`; `/data/tabz.db` in Docker). `DATABASE_URL` (libSQL URL, e.g. Turso) takes precedence if set. |
| `BETTER_AUTH_SECRET` | Required in production. |
| `BETTER_AUTH_URL` | Public origin, e.g. `https://tabz.space`. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional. Enables "Continue with GitHub". Callback URL: `https://tabz.space/api/auth/callback/github`. |

## Data model

`user → boards → groups → bookmarks` are relational tables (ownership checks, ordering, cascades). Everything a user customizes is stored as JSON documents (`user_settings.settings`, `boards.layout`, `groups.options`, `bookmarks.meta/tags`) and validated with Zod in `src/lib/preferences.ts`, so new options don't need migrations.

## Where things live

- `src/server/home.ts`: server functions (all wrapped in Effect programs; typed errors in `src/lib/effect/errors.ts`)
- `src/server/metadata.ts`: page title/favicon lookup with timeout, retry and private-network blocking
- `src/lib/api.ts`: browser → server calls as Effects (retry on network failure, time-boxed)
- `src/components/home/*`: the start page UI
- `extension/`: Chrome/Edge/Brave MV3 extension (see its README)

## Deploy (Railway)

Dockerfile build with a volume mounted at `/data` for the SQLite file. Keep the service at a single replica, since SQLite is a local file.
