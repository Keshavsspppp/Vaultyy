# Vaultly

Personal cloud storage with a calm, editorial interface. Upload, organize, version, share and preview files; keep them on Cloudflare R2 / S3; sign in with a password or Google; and let AI summarize, tag and answer questions about your files.

Built with Next.js 16 as a full-stack portfolio project — the feature set of a Drive-style product with its own design language (paper tones, serif display type, hairline borders) rather than a copy of an existing UI.

<p>
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#api">API</a> ·
  <a href="#testing">Testing</a> ·
  <a href="#deployment">Deployment</a>
</p>

## Features

**Files & folders**
- Nested folders, drag-and-drop upload of files *and whole folders* (structure preserved), per-file progress panel
- Rename, star, move via a folder picker or by dragging onto a folder / breadcrumb
- Trash → restore / delete forever / empty trash; deleting releases storage quota
- Multi-select with click, Ctrl/⌘-click, Shift-click ranges and Ctrl+A; a selection toolbar for bulk download, move, star and trash
- Folders and multi-selections download as a streamed zip

**Versioning**
- Upload a new version of any file (same id, name and shares), browse the history, download any version, make an older one current, delete versions
- Every version counts toward quota; the oldest non-current versions are pruned past `FILE_VERSION_LIMIT`

**Sharing**
- Share with other users by email as *Viewer* or *Editor*; access is inherited down the folder tree
- "Anyone with the link" pages (`/s/<token>`) that work without an account, including folder browsing and zip download

**Views & previews**
- All files, Shared, Recent, Starred, Trash and Search (matches names, AI summaries and tags)
- Grid or list layout, sortable columns, a details side panel, mobile navigation drawer; `/` focuses search
- In-app previews for images, video, audio, PDF and text/code with keyboard navigation

**Storage**
- Per-user quota with a usage meter
- Files go straight from the browser to S3-compatible object storage via presigned URLs (Cloudflare R2, AWS S3, MinIO) — bytes never pass through the app server
- Zero-config local-disk fallback for development

**AI (Groq)**
- Every upload is indexed in the background with a one-line summary and search tags (text, code, PDF, images)
- **Ask AI** panel in the preview: streamed, Markdown-formatted answers about the open file (vision model for images)
- **"What changed vs current?"** explains the difference between two versions of a file

**Auth**
- Email + password (Auth.js credentials provider, bcrypt) and optional **Sign in with Google**; Google users get a local account linked by verified email

**Production hardening**
- Per-identity rate limiting on auth, upload, AI and bulk-write routes (signed-in users by account, anonymous callers by IP)
- Configuration validated at server startup — a missing `AUTH_SECRET` or a malformed `S3_ENDPOINT` stops the boot with an actionable message instead of failing later
- Security headers (CSP, HSTS, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`), no `X-Powered-By`, and `no-store` on API responses
- Error, not-found and loading boundaries so failures stay inside the app shell
- `GET /api/health` liveness probe that checks the database

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Route Handlers), React 19, TypeScript |
| Styling | Tailwind CSS v4 with a token-based theme, Fraunces + Inter via `next/font`, lucide-react icons |
| Database | SQLite via Prisma 7 with the `better-sqlite3` driver adapter |
| Auth | Auth.js v5 (credentials + Google), JWT sessions |
| Storage | AWS SDK v3 (`@aws-sdk/client-s3`) presigned uploads/downloads, local-disk provider |
| AI | Groq SDK (`openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`), `unpdf` for PDF text |
| Other | `archiver` (zip streaming), `zod` (validation), `react-markdown` |
| Tests | Vitest integration tests against a throwaway SQLite database |

## Quick start

```bash
npm install                 # also generates the Prisma client (postinstall)
cp .env.example .env        # then set AUTH_SECRET (openssl rand -base64 32)
npx prisma migrate dev      # creates prisma/dev.db
npm run dev
```

Open http://localhost:3000, create an account and start uploading. With no `S3_*` settings, files are stored under `./uploads`; with no `GROQ_API_KEY`, the AI features are hidden; with no Google keys, the Google button is hidden.

## Configuration

All settings are environment variables — see [`.env.example`](.env.example) for the annotated template.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | SQLite file, e.g. `file:./prisma/dev.db` (resolved from the project root) |
| `AUTH_SECRET` | yes | Secret for signing session JWTs |
| `AUTH_TRUST_HOST` | yes | `true` when running behind a proxy / in Docker |
| `STORAGE_QUOTA_BYTES` | no | Per-user quota, default 1 GiB |
| `FILE_VERSION_LIMIT` | no | Versions kept per file, default 25 |
| `S3_BUCKET` | no | Set to use object storage; leave empty for local disk |
| `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | with S3 | Endpoint is the host only (no bucket path); `S3_FORCE_PATH_STYLE=true` for MinIO |
| `LOCAL_UPLOAD_DIR` | no | Local-disk directory, default `./uploads` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Enables Google sign-in |
| `GROQ_API_KEY` | no | Enables AI features |
| `GROQ_PARSE_MODEL`, `GROQ_REASON_MODEL`, `GROQ_VISION_MODEL`, `AI_MAX_TEXT_CHARS` | no | Model overrides and text cap (default 120 000 chars) |

### Cloudflare R2 / S3

1. Create a bucket. On R2, open **Manage R2 API Tokens** → *Create API token* with **Object Read & Write** scoped to the bucket; copy the Access Key ID, Secret Access Key and the S3 endpoint.
2. Set the `S3_*` variables (endpoint like `https://<account-id>.r2.cloudflarestorage.com`, region `auto`).
3. Uploads are presigned `PUT`s from the browser, so the bucket needs a CORS policy allowing your origin:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add your production origin when you deploy. Switching storage does not migrate existing objects.

### Google sign-in

1. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) create an **OAuth client ID** (*Web application*).
2. Add the redirect URI `http://localhost:3000/api/auth/callback/google` (plus your production URL with the same path).
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Accounts created through Google have no password; the login form points such users to the Google button, and an existing password account can also sign in with Google (linked by verified email).

### AI

Create a key at https://console.groq.com/keys and set `GROQ_API_KEY`. Groq has no native document input, so the app extracts text itself (PDFs through `unpdf`) and sends images as data URLs to a vision model. Text longer than `AI_MAX_TEXT_CHARS` is truncated; images over 4 MB and other binary types are skipped with a clear status.

## Architecture

```
src/
  app/
    (auth)/login, register        split editorial sign-in / sign-up, Google button
    files/                        authenticated shell: masthead, rail navigation, upload panel
      page.tsx                    All files (root)
      folder/[id]                 any folder you own or that is shared with you
      shared · recent · starred · trash · search
    s/[token]                     public share-link page
    api/                          see "API" below
  lib/
    access.ts                     role resolution (owner / editor / viewer) with inheritance up the tree
    storage.ts                    StorageProvider: S3Storage | LocalStorage
    versions.ts                   publish / restore / delete / prune file versions
    ai.ts                         content extraction (text / PDF / image) + Groq calls
    zip.ts                        streams a folder tree as a zip
    queries.ts                    server-side listings for each view
    auth.ts                       Auth.js config, Google account linking, requireUserId()
    rate-limit.ts                 in-process fixed-window limiter, per user or IP
    env.ts                        startup configuration validation (loaded by instrumentation.ts)
    nodes.ts                      DTOs, hard delete, quota
  components/drive/               FileBrowser (grid/list, selection, context menu, DnD), modals,
                                  upload manager, Ask AI panel, details panel
  components/ui/                  Modal / Button / TextInput, Menu, Markdown, hydration-safe DateText
  app/globals.css                 design tokens (colors, type, radii) consumed by Tailwind
  proxy.ts                        optimistic auth redirects (cookie check only)
  instrumentation.ts              runs once at server start; validates configuration
  app/error.tsx · global-error.tsx · not-found.tsx · files/loading.tsx
prisma/schema.prisma              User · Node (file|folder) · FileVersion · Share · ShareLink
prisma.config.ts                  Prisma 7 CLI config (schema, migrations dir, DATABASE_URL)
src/generated/prisma/             generated client (gitignored; created by `prisma generate`)
tests/                            Vitest integration tests
```

**Data model.** Files and folders share one `Node` table with a self-referencing `parentId`, so moving, trashing and permission lookups are uniform. Trashing sets `trashedAt` on the top-level item only; descendants are hidden by walking ancestors. Permanent deletion removes the subtree, every stored version, and releases quota.

**Permissions.** `getAccess()` walks from a node to the root and takes the strongest role from ownership, a `Share` on any ancestor, or a `ShareLink` token on any ancestor. Editors can upload, rename and trash inside a shared folder (items they create are owned by — and count against — the folder owner); only owners can move, share, delete versions, or delete forever. Every API route re-checks access per node, including bulk operations.

**Uploads.** Two steps: `upload/init` reserves a pending row and returns a URL to `PUT` bytes to (a presigned S3 URL, or an internal route for local disk); `upload/complete` verifies the stored size, publishes the node, records version 1 and charges quota. Abandoned uploads never become visible.

**Versions.** Each upload creates a `FileVersion` with its own storage object; the `Node` mirrors the current version (`storageKey`, `size`, `currentVersion`) so downloads, previews and zips need no extra lookup. Restoring re-points the node without copying; pruning drops the oldest non-current versions beyond the limit.

**Rate limiting.** Counters live in process memory, which matches the deployment model (SQLite is single-writer, so the app runs as one instance). Limits are keyed by user id when signed in and by client IP otherwise, so one noisy account cannot exhaust everyone's budget. Running several instances would need a shared store such as Redis — the `rateLimit()` signature is the only thing that would change.

**AI.** `upload/complete` and `versions/complete` schedule `summarize()` with Next's `after()` so indexing never delays the response. Results (`aiSummary`, `aiTags`, `aiStatus`, `aiVersion`) live on the `Node` and feed search. Chat streams model deltas to the browser as plain text; the UI renders them as Markdown.

## API

All routes live under `src/app/api` and return JSON (errors as `{ error }` with a proper status).

| Route | Purpose |
|---|---|
| `POST /api/auth/register` · `/api/auth/[...nextauth]` | sign-up, Auth.js handlers |
| `POST /api/nodes` | create folder |
| `GET/PATCH/DELETE /api/nodes/[id]` | read · rename / move / star · trash (`?permanent=1` deletes forever) |
| `POST /api/nodes/[id]/restore` · `POST /api/trash/empty` | restore from trash · empty trash |
| `POST /api/nodes/batch` | bulk trash / restore / delete / star / move, authorized per id |
| `POST /api/nodes/path` | ensure a nested folder path exists (folder uploads) |
| `GET /api/nodes/[id]/download` | file download / inline preview (presigned redirect or stream); folders stream a zip |
| `GET /api/download/zip?ids=` | zip of several items |
| `GET/POST/PUT/DELETE /api/nodes/[id]/share` | list · share with user · link sharing · remove share |
| `GET/POST /api/nodes/[id]/versions` · `complete` · `[vid]/download` · `[vid]/restore` · `DELETE [vid]` | version history and lifecycle |
| `POST /api/upload/init` · `complete` · `PUT /api/upload/local/[key]` | two-step uploads |
| `POST /api/ai/summarize` · `/api/ai/chat` (streams) · `/api/ai/version-diff` | AI indexing, file Q&A, version comparison |
| `GET /api/me` · `GET /api/folders` | profile + quota · folder picker data |
| `GET /api/health` | liveness probe (`{status, uptime}`, 503 if the database is unreachable) |

Public share links pass `?token=` to the download and version endpoints.

## Testing

```bash
npm test
```

Vitest runs integration tests against a throwaway SQLite database (`prisma/test.db`, recreated by a global setup) and a local upload directory, covering share inheritance and strongest-role resolution, link tokens, trashed-ancestor visibility, breadcrumb truncation across share boundaries, self-move detection, quota accounting on hard delete, listing/search queries, the full version lifecycle (numbering, quota rejection, pruning, restore, delete), and the rate limiter (per-identity counters, window refill, retry hint).

## Scripts

| Command | |
|---|---|
| `npm run dev` | start the dev server |
| `npm run build` / `npm start` | production build (runs `prisma generate` first) / serve |
| `npm test` / `npm run test:watch` | integration tests |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npx prisma migrate dev` | create / apply migrations locally |
| `npx prisma studio` | browse the database |

## Deployment

### Docker

```bash
cp .env.example .env         # set AUTH_SECRET and any S3 / Google / Groq keys
docker compose up --build
```

The multi-stage [`Dockerfile`](Dockerfile) generates the Prisma client, builds Next.js in standalone mode and produces a ~400 MB image. On start it applies pending SQLite migrations with the lightweight [`scripts/migrate.mjs`](scripts/migrate.mjs) (Prisma-compatible `_prisma_migrations` records, no CLI in the image) and then serves. The SQLite database and local uploads live on the `vaultly-data` volume; set the `S3_*` variables to use object storage instead.

After deploying, add your production origin to the R2 bucket's CORS `AllowedOrigins` and the callback URL `https://<your-domain>/api/auth/callback/google` to the Google OAuth client. Point the host's health check at `/api/health`.

### Anywhere else

Any Node 24 host works: set the environment variables, run `npm ci && npm run build`, apply migrations with `npx prisma migrate deploy`, then `npm start`. Uploads go directly to object storage, so the app server is stateless apart from the SQLite file — keep it on a persistent disk, or point `DATABASE_URL` at Postgres and swap the Prisma adapter.

## Limitations & ideas

- SQLite is a single-writer database; for multi-instance deployments switch to Postgres (Prisma adapter + one schema change).
- Search is `LIKE`-based; embeddings would make it semantic.
- No real-time collaboration or activity log yet.
- An AI "drive assistant" with tools (search, move, organize) is a natural next step on top of the existing permission-checked API.

## License

MIT
