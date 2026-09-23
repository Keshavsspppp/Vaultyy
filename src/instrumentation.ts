/**
 * Runs once when a server instance starts, before it accepts requests.
 * Validating configuration here means a misconfigured deployment fails at boot
 * with a clear message, instead of surfacing as confusing errors on first use.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await import("@/lib/env");
}
