import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      DATABASE_URL: "file:./prisma/test.db",
      LOCAL_UPLOAD_DIR: "./.test-uploads",
      S3_BUCKET: "", // always exercise the local storage provider in tests
      GROQ_API_KEY: "",
      STORAGE_QUOTA_BYTES: "10000",
      FILE_VERSION_LIMIT: "3",
      AUTH_SECRET: "test-secret",
    },
    fileParallelism: false, // all suites share one SQLite file
  },
});
