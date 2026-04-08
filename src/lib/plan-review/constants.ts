/** Max upload size for plan PDF (bytes). */
/**
 * NOTE: Keep this under Cloud Run / proxy request size limits.
 * Multipart/form-data adds overhead; 20MB PDF + fields stays under common ~32MB gateways.
 */
export const PLAN_REVIEW_MAX_PDF_BYTES = 20 * 1024 * 1024;

/** Max pages processed and sent to the model (first N pages in order). */
export const PLAN_REVIEW_MAX_PAGES = 20;

/** pdf-to-img scale — higher = sharper but larger payloads. */
export const PLAN_REVIEW_RASTER_SCALE = 1.75;

/**
 * Disable PNG rasterization by default.
 *
 * Cloud hosting often lacks native canvas deps; in those cases rasterization can crash the process and
 * surface as a Google-branded 502 upstream error before our handler can stream NDJSON.
 *
 * Set `PLAN_REVIEW_ENABLE_RASTER=1` in the server environment to re-enable image-mode review.
 */
export const PLAN_REVIEW_ENABLE_RASTER = process.env.PLAN_REVIEW_ENABLE_RASTER === '1';

/** Perplexity request timeout (ms). More pages / large text payloads need headroom. */
export const PLAN_REVIEW_PERPLEXITY_TIMEOUT_MS = 300_000;
