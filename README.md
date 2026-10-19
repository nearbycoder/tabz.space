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

## Vault

A per-user hidden space for links you don't want anyone snooping on.

- Vault boards (`boards.vault = 1`) are filtered out on the server unless the request carries a valid unlock cookie, so they never reach the browser, search, ⌘K, the most-visited strip, exports or MCP while locked. MCP never gets vault access.
- Open it by typing your secret code anywhere on the home page (default `vault`; change it in Customize → Vault), then entering the vault password.
- The password is separate from the account password, hashed with scrypt (`vaults` table), and unlock attempts are throttled.
- Unlocking issues a short-lived `tabz_vault` cookie (httpOnly, SameSite=Strict, HMAC-signed with `BETTER_AUTH_SECRET`). Auto-lock happens after 5 min to 4 h, or immediately with the lock button.
- Code: `src/server/vault.ts`, `src/server/vault-token.ts`, and the `VaultAccess` Effect reference in `src/server/vault-access.ts` (consumed by `library.ts`).

## Mobile

On phones the page switches to a thumb-reach bottom dock (search, edit, add, theme/lock, customize). Dialogs become bottom sheets that move up with the keyboard, inputs use 16px text so iOS doesn't zoom, and touch drag needs a short press-and-hold so swiping still scrolls. A long press released without moving opens the editor. The vault opens with 5 quick taps on the clock. `public/site.webmanifest` makes tabz installable (Add to Home Screen), and on Android its `share_target` puts tabz in the system share sheet (`/add`).

## Incognito links

Mark a link, or a whole folder, as always-incognito, or switch on "Open every link in incognito" (Customize → Home). Web pages can't open private windows, so the browser extension does it: its content script (`extension/bridge.js`, injected only on tabz.space) relays requests to the background worker, which calls `chrome.windows.create({ incognito: true })`. This needs "Allow in Incognito" switched on for the extension. Without the extension, tabz never falls back to a normal tab; it offers to copy the link instead. Private links skip visit tracking, hover previews and screenshot thumbnails.

## Search, smart groups and monitors

- **Full-text search**: page text is extracted when a link is saved (and by the `index-content` job for older ones) into an FTS5 table, `bookmark_text` (migration 0007, `src/server/content.ts`). ⌘K shows "Found in page text" matches with highlighted snippets; REST/MCP search returns them with the matching passage. Vault boards are never indexed.
- **Smart groups** (`groups.kind = "smart"`, rules in `groups.options.smart`): live views over every non-vault board (most visited, recently opened, newest, forgotten, unread feeds, broken links; filter by tags, text or board). Computed in the browser (`src/lib/smart.ts`), so they never store links.
- **Link health** (`check-links` job, `src/server/monitors.ts`): re-checks each link weekly with HEAD/GET, following redirects through the private-network guard. A link is "broken" only after two failed checks in a row (404/410/unreachable); 401/403/429/5xx and intranet hosts count as inconclusive. Permanent same-site redirects are offered as "Update link". Customize → Data → Broken links, or ⌘K.
- **Feeds** (`poll-feeds` job): links whose page advertises RSS/Atom get their latest items polled every couple of hours; tiles show a badge with posts newer than your last visit.

## Widgets, schedules and your month

- **Widgets** are groups with `kind = "widget"` and their settings/content in `groups.options.widget` (`widgetSchema` in `src/lib/preferences.ts`): notes, to-do, focus timer (Pomodoro, state in localStorage), weather (Open-Meteo), calendar (any iCal/.ics link, parsed by `src/server/ics.ts` with time zones, recurrence and exceptions), stocks (Yahoo Finance public chart endpoint; Stooq now blocks automated requests) and news feed. Network data is fetched server-side and cached in memory (`src/server/widgets.ts`). Notes/to-dos save through `saveWidget`, which skips the activity log.
- **Time-based boards**: `boards.layout.schedule` (days + from/to). During the window tabz opens on that board; picking another board overrides it until the schedule changes. The browser's time zone is stored in settings so server rendering picks the same board.
- **Rediscover**: three links you haven't opened in 30+ days, the same all day, with shuffle and quick trash.
- **Monthly report**: every opened link is logged in `visits` (kept ~13 months). "Your month in tabz" (⌘K, or a banner in the first week of a month) shows opens, active days, a daily chart, most-opened links and habits (`src/server/report.ts`).

## Sharing and themes

- **Public links**: Edit board → "Anyone with the link can view" gives `/b/<slug>` (`boards.share_slug`), a server-rendered read-only page with Open Graph tags and **Copy to my tabz** (signs visitors up first, then finishes the copy). Only regular groups and links are shown: no widgets, smart groups or incognito links. Vault boards can't be shared.
- **Collaborators**: invite existing users by username or email as editors or viewers (`board_members`, `src/server/sharing.ts`). Shared boards appear in their tabs with a 👥 marker; viewers get a read-only UI, and every write is checked server-side by `accessBoard`.
- **Custom CSS** (Customize → Look): applied to your own home page with stable hooks (`[data-group]`, `[data-tile]`, `[data-clock]`, `[data-board]`, `.glass`, CSS variables).
- **Community themes**: publish your look (colors, background, font, shape, custom CSS; never links). Published CSS is sanitized: no `@import`, no external `url()`, so applying a theme can't track you.

## REST API, tokens and webhooks

Customize → Connect has personal API tokens and outgoing webhooks.

- **REST** (`/api/v1`, `Authorization: Bearer tabz_…`, CORS open): `GET /me`, `GET /library`, `GET /bookmarks?q=`, `POST /bookmarks` (same smart targeting as the MCP `add_bookmark`: group/folder by name, created if missing), `POST /bookmarks/bulk`, `PATCH|DELETE /bookmarks/:id`, `POST /groups`, `POST /tabs` (a window's tabs → new group), `PUT /sync/browser`, `POST /undo`, `GET /activity`. Router in `src/server/rest.ts`.
- **Tokens** are stored as SHA-256 hashes (`src/server/api-tokens.ts`). The extension gets its own token automatically: the signed-in page mints one and posts it through the bridge.
- **Webhooks** (`src/server/webhooks.ts`) fire on every change recorded in the activity log (`bookmark.create`, `group.delete`, …). Each POST carries `x-tabz-timestamp` and `x-tabz-signature: sha256=<hex HMAC-SHA256 of "timestamp.body" with the webhook secret>`, and is retried with backoff. URLs must be public https.

## Data model

`user → boards → groups → bookmarks` are relational tables (folders are bookmark rows with `kind = "folder"`; links point at them via `parent_id`, one level deep) (ownership checks, ordering, cascades). Everything a user customizes is stored as JSON documents (`user_settings.settings`, `boards.layout`, `groups.options`, `bookmarks.meta/tags`) and validated with Zod in `src/lib/preferences.ts`, so new options don't need migrations.

## Where things live

- `src/server/library.ts`: all bookmark/board/group logic as Effect programs (typed errors in `src/lib/effect/errors.ts`)
- `src/server/home.ts`: thin server-function wrappers used by the web app
- `src/server/metadata.ts`: page title/favicon lookup with timeout, retry and private-network blocking
- `src/lib/api.ts`: browser → server calls as Effects (retry on network failure, time-boxed)
- `src/components/home/*`: the start page UI
- `extension/`: Chrome/Edge/Brave/Firefox MV3 extension (see its README); `scripts/build-extension.mjs` packages it into `public/downloads/`

## Deploy (Railway)

Dockerfile build with a volume mounted at `/data` for the SQLite file. Keep the service at a single replica, since SQLite is a local file.
