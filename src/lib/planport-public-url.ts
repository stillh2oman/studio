/**
 * Public https base URL for PlanPort (no trailing slash).
 * Set `NEXT_PUBLIC_APP_URL` in each environment so email links match the deployed app
 * (e.g. `https://your-project.web.app` or your custom domain).
 * Optional server-only override: `PLANPORT_PUBLIC_URL`.
 */
export function getPlanportPublicAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.PLANPORT_PUBLIC_URL?.trim();
  if (raw) {
    let u = raw.replace(/\/$/, "");
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    return u;
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    return `https://${host}`;
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:9002";
  }
  console.warn(
    "[planport-public-url] NEXT_PUBLIC_APP_URL is not set; blueprint notification links may be wrong. Set NEXT_PUBLIC_APP_URL to your live app URL."
  );
  return "https://studio-5055895818-5ccef.web.app";
}
