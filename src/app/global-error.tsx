"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, so it
 * must render its own <html>/<body> and cannot rely on app styles.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#f5f1e8",
          color: "#1f1b16",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 30, margin: 0 }}>Vaultly is temporarily unavailable</h1>
        <p style={{ color: "#776d60", maxWidth: 420, margin: 0 }}>
          An unexpected error stopped the app from starting. Please try again in a moment.
        </p>
        {error.digest && <p style={{ fontFamily: "monospace", fontSize: 12, color: "#776d60" }}>Reference: {error.digest}</p>}
        <button
          onClick={reset}
          style={{ background: "#1f1b16", color: "#f5f1e8", border: 0, borderRadius: 8, padding: "10px 18px", fontSize: 14, cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
