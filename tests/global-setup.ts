import { execSync } from "node:child_process";
import fs from "node:fs";

/** Recreates the throwaway test database and a clean upload dir before the suite runs. */
export default function setup() {
  for (const f of ["prisma/test.db", "prisma/test.db-journal"]) fs.rmSync(f, { force: true });
  execSync("npx prisma db push", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./prisma/test.db" },
  });
  fs.rmSync(".test-uploads", { recursive: true, force: true });
  return () => {
    fs.rmSync(".test-uploads", { recursive: true, force: true });
  };
}
