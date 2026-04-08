"use client";

import dynamic from "next/dynamic";

/**
 * Client-only admin mount. Avoids Next SSR walking the full admin dependency graph,
 * which was triggering intermittent `webpack-runtime` / `__next_app__.require` errors
 * in dev (especially after HMR on Windows).
 */
const AdminPortalClient = dynamic(
  () =>
    import("@planport/components/admin/AdminPortalClient").then((m) => ({
      default: m.AdminPortalClient,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
        <p className="text-sm font-medium text-foreground/80">Loading PlanPort Admin…</p>
        <p className="text-xs max-w-sm">If this stays visible, hard-refresh the page (Ctrl+Shift+R).</p>
      </div>
    ),
  }
);

export default function AdminEntry() {
  return <AdminPortalClient />;
}
