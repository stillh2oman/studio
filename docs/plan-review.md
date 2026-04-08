# Plan Review (Toolset)

Architectural PDF plan sets: upload → server extracts text from the first **N** pages (default) → Perplexity (text) → structured JSON → downloadable report PDF.

Optional **image mode:** set server env `PLAN_REVIEW_ENABLE_RASTER=1` to rasterize with **pdf-to-img** (needs native canvas on the host; otherwise use text mode).

## Correct API URL

- **`POST /api/plan-review/run`** (note spelling). Typos **`/api/paln-review-run`** or **`/api/plan-review-run`** are rewritten to this route in `next.config.mjs`.

## Firebase `identitytoolkit.googleapis.com … signUp` 400

The app may call **`signInAnonymously`** when a Ledger session exists in `localStorage` but there is no Firebase user (Storage/Firestore rules expect `request.auth`). If **Anonymous** sign-in is disabled in Firebase Console, the browser shows a **400** on the Identity Toolkit `signUp` endpoint.

**Fix:** Firebase Console → **Authentication** → **Sign-in method** → enable **Anonymous** — or sign in with email/password so anonymous is not needed.

## Configuration

Set the server environment variable:

```bash
PERPLEXITY_API_KEY=pplx-...
```

- **Local:** add to `.env.local` and restart `npm run dev`.
- **Firebase / Cloud Run / hosting:** add the secret in your deployment environment (never commit keys).

The UI calls `GET /api/plan-review/config` to detect whether the key is present (the key is never exposed to the client).

## Flow

1. **Browser:** Toolset → **Plan Review** → choose Residential or Commercial, pick a prompt template, optional notes, attach a `.pdf`, submit.
2. **`POST /api/plan-review/run`:** multipart form (`file`, `templateId`, `notes`).
3. **Server:** creates a temp directory under the OS temp folder, extracts text for up to **N** pages (`extractPdfTextByPage`), sends that text to **Perplexity** `POST https://api.perplexity.ai/v1/sonar` (`sonar-pro`, `disable_search: true`). If `PLAN_REVIEW_ENABLE_RASTER=1`, rasterization is attempted first with fallback to text.
4. **Response:** NDJSON stream (`application/x-ndjson`) with `progress` lines, then `complete` with base64 report PDF + parsed analysis JSON.
5. **Cleanup:** the job temp directory (PDF + page PNGs) is **always** removed in a `finally` block (success or failure).

## Prompt templates

Defined in **`src/lib/plan-review/prompts.ts`** as data (`PLAN_REVIEW_PROMPTS`). The UI uses `listPromptsByCategory()`; the API resolves templates with `getPlanReviewPromptTemplate(id)`.

## Limits & tuning

| Constant | File | Purpose |
|----------|------|---------|
| `PLAN_REVIEW_MAX_PDF_BYTES` | `constants.ts` | Max upload size |
| `PLAN_REVIEW_MAX_PAGES` | `constants.ts` | First *N* pages sent to the model |
| `PLAN_REVIEW_RASTER_SCALE` | `constants.ts` | pdf-to-img scale (sharpness vs payload) |
| `PLAN_REVIEW_PERPLEXITY_TIMEOUT_MS` | `constants.ts` | Abort controller timeout |
| `PLAN_REVIEW_ENABLE_RASTER` | env `=1` | When set, try PNG rasterization before text |

If hosting returns **413** on upload, increase the platform / Next body limit for API routes.

## Native dependencies & 502 errors

**pdf-to-img** depends on **canvas** (node-canvas). On **Firebase App Hosting / Cloud Run**, the default Node image often **does not** include Cairo/Pango libraries, so `canvas` may fail to load or rasterization may throw. That used to surface as an unhandled rejection (and **502 Bad Gateway**) because `ReadableStream` was started with an **`async start()`**, which many runtimes do not await.

Current behavior:

1. **`start()` is synchronous**; work runs inside `void (async () => { ... })()` with errors sent as NDJSON `error` events.
2. By default the server uses **text extraction only** (no high-res PNG step) to avoid native **canvas** crashes that surface as **502** on Cloud Run.
3. If `PLAN_REVIEW_ENABLE_RASTER=1`, rasterization / vision may run first; on failure it **falls back** to text (scanned plans may have little text without images).

For **full image-based review** in production, use a container image that installs canvas system deps (Cairo, Pango, etc.) or another PDF→image path that does not rely on native canvas.

`next.config.mjs` lists `serverExternalPackages` for `canvas`, `pdf-to-img`, and `pdfjs-dist`.

## Security

- The Perplexity key is **only** read from `process.env` on the server.
- Do not accept API keys from the browser for production use; the UI only shows setup instructions when the server is not configured.
