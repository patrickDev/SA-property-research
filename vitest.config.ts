import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    globals: true,
    include: ["src/__tests__/**/*.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Provide a local D1 database for tests
          d1Databases: { DB: "test-db" },
          r2Buckets: ["FILES_BUCKET"],
          queues: {
            producers: {
              IMPORT_QUEUE: "bexar-import-jobs",
              EXPORT_QUEUE: "bexar-export-jobs",
            },
            consumers: ["bexar-import-jobs", "bexar-export-jobs"],
          },
        },
      },
    },
  },
});
