# tabz.space

A fast, customizable start page: boards → groups → folders → bookmarks in a drag-and-drop grid, a ⌘K palette to jump anywhere, hover previews of every site, deep theming (presets, fonts, corners, glass/solid/outline panels, gradients, patterns, photo wallpapers), a browser extension to save pages in one click, and an OAuth MCP server for AI assistants.

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

## MCP server

`https://tabz.space/api/mcp` is a remote (Streamable HTTP) MCP server, so any MCP client can manage a user's boards, groups and bookmarks. Auth is OAuth 2.1 through Better Auth's `mcp()` plugin: clients self-register (Client ID Metadata Documents, or Dynamic Client Registration for older clients), the user signs in and approves on `/consent`, and access tokens are JWTs audience-bound to the MCP URL. Users don't need tokens or keys.

```sh
claude mcp add --transport http tabz https://tabz.space/api/mcp
```

- Tools: `get_library`, `search_bookmarks`, `add_bookmark` (can target a group by name and creates it if missing), `update_bookmark`, `delete_bookmark`, `reorder_bookmarks`, `create/update/delete_group`, `create/update/delete_board`, `update_settings`.
- Code: `src/routes/api/mcp.ts` (endpoint + token verification), `src/server/mcp/tools.ts` (tools), `src/routes/[.]well-known/$.ts` (OAuth discovery), `src/components/Consent.tsx`.
- Tools call the same Effect programs in `src/server/library.ts` that the web app's server functions use.

## Data model

`user → boards → groups → bookmarks` are relational tables (folders are bookmark rows with `kind = "folder"`; links point at them via `parent_id`, one level deep) (ownership checks, ordering, cascades). Everything a user customizes is stored as JSON documents (`user_settings.settings`, `boards.layout`, `groups.options`, `bookmarks.meta/tags`) and validated with Zod in `src/lib/preferences.ts`, so new options don't need migrations.

## Where things live

- `src/server/library.ts`: all bookmark/board/group logic as Effect programs (typed errors in `src/lib/effect/errors.ts`)
- `src/server/home.ts`: thin server-function wrappers used by the web app
- `src/server/metadata.ts`: page title/favicon lookup with timeout, retry and private-network blocking
- `src/lib/api.ts`: browser → server calls as Effects (retry on network failure, time-boxed)
- `src/components/home/*`: the start page UI
- `extension/`: Chrome/Edge/Brave MV3 extension (see its README)

## Deploy (Railway)

Dockerfile build with a volume mounted at `/data` for the SQLite file. Keep the service at a single replica, since SQLite is a local file.
