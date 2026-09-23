import "server-only";

/**
 * Validates configuration once, at module load, so a misconfigured deployment
 * fails immediately and loudly instead of producing confusing auth or storage
 * errors later. Imported by the root layout, which every request renders through.
 */
const problems: string[] = [];
const warnings: string[] = [];

const isProd = process.env.NODE_ENV === "production";
// `next build` prerenders pages with NODE_ENV=production but without the deployment
// secrets, so validation must only run when the server is actually serving.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";

if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is not set.");

const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
if (!secret) {
  problems.push("AUTH_SECRET is not set. Generate one with: openssl rand -base64 32");
} else if (isProd && secret.length < 32) {
  problems.push("AUTH_SECRET is too short for production (use at least 32 characters).");
} else if (isProd && /change-?me|dev-secret|test|secret123/i.test(secret)) {
  problems.push("AUTH_SECRET still looks like a placeholder. Set a real random value.");
}

// S3 is optional, but a half-configured bucket silently breaks every upload.
if (process.env.S3_BUCKET) {
  for (const key of ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
    if (!process.env[key]) problems.push(`${key} is required when S3_BUCKET is set.`);
  }
  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint) {
    try {
      const url = new URL(endpoint);
      if (url.pathname !== "/" && url.pathname !== "") {
        problems.push(`S3_ENDPOINT must be the host only, without the bucket path (got "${url.pathname}").`);
      }
    } catch {
      problems.push(`S3_ENDPOINT is not a valid URL: "${endpoint}"`);
    }
  }
} else if (isProd) {
  warnings.push("S3_BUCKET is not set — uploads are stored on local disk, which is lost when the container is replaced.");
}

// Google sign-in needs both halves or neither.
const googleId = process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!!googleId !== !!googleSecret) problems.push("Google sign-in needs both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or neither).");

if (isProd && !process.env.AUTH_TRUST_HOST && !process.env.AUTH_URL) {
  warnings.push("Neither AUTH_TRUST_HOST nor AUTH_URL is set — OAuth callbacks may build the wrong redirect URL behind a proxy.");
}

if (!isBuild) for (const w of warnings) console.warn(`[config] ${w}`);

if (problems.length && !isBuild) {
  const message = ["Invalid configuration:", ...problems.map((p) => `  - ${p}`), "", "See .env.example for the full list of variables."].join("\n");
  // In production a bad config should stop the process; in development, log it so
  // the dev server stays up while the .env is being fixed.
  if (isProd) throw new Error(message);
  console.error(`[config] ${message}`);
}

export const env = {
  isProd,
  storage: process.env.S3_BUCKET ? ("s3" as const) : ("local" as const),
  googleEnabled: !!(googleId && googleSecret),
  aiEnabled: !!process.env.GROQ_API_KEY,
};
