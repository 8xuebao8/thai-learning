import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./production-tests",
  outputDir: "production-results",
  use: { baseURL: "http://127.0.0.1:4173/thai-learning/" },
  webServer: {
    command:
      "PAGES_BASE=/thai-learning/ npm run build && PAGES_BASE=/thai-learning/ npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173/thai-learning/",
    timeout: 60000,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1050 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
