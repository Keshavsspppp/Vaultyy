import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * Content Security Policy.
 *
 * - `img-src` allows blob:/data: for local previews and https: because file
 *   previews are served from presigned S3/R2 URLs on the bucket's own host.
 * - `connect-src` allows https: for the same reason (direct browser → bucket PUT).
 * - `'unsafe-inline'` on styles is required by Tailwind's injected styles; in
 *   development Next also needs `'unsafe-eval'` for React Refresh.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' blob: data: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: ws: wss:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Only meaningful over HTTPS, so it is production-only.
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  // Emits a self-contained server for the Docker image.
  output: "standalone",
  // Keep the dev-tools badge away from the wordmark in the top-left.
  devIndicators: { position: "bottom-right" },
  // Keep native/Node-only packages out of the bundle.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-better-sqlite3", "better-sqlite3", "archiver"],
  poweredByHeader: false,
  headers() {
    return Promise.resolve([
      { source: "/:path*", headers: securityHeaders },
      // API responses should never be cached by intermediaries.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] },
    ]);
  },
};

export default nextConfig;
