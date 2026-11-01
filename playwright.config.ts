import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, timeout: 35000,
  use: { baseURL: process.env.PAGECRATE_TEST_URL ?? "http://127.0.0.1:4381", browserName: "chromium", trace: process.env.PAGECRATE_TEST_URL ? "off" : "retain-on-failure", screenshot: "only-on-failure" },
  reporter: "list",
});
