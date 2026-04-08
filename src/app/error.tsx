"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep this as a real log so it shows in DevTools.
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          App crashed while rendering
        </h2>
        <p style={{ marginTop: 12, marginBottom: 12 }}>
          {error?.message || "Unknown error"}
        </p>
        {error?.digest ? (
          <p style={{ marginTop: 0, opacity: 0.75 }}>Digest: {error.digest}</p>
        ) : null}
        <button
          onClick={() => reset()}
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}

