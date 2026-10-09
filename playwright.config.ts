import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	/* Retry on CI only */
	retries: process.env.CI ? 2 : 0,
	/* Opt out of parallel tests on CI. */
	workers: process.env.CI ? 1 : undefined,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: "html",
	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
		trace: "on-first-retry",
		baseURL: "http://localhost:3000",
	},

	/* Configure projects for major browsers */
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
			timeout: 10_000,
			testIgnore: "bundle/**",
		},
		/* Tests against the built bundles (run `npm run build` first). Separate projects get separate
		   workers, so each bundle registers its own copy of the pw-table selector engine. */
		{
			name: "dist-cjs",
			use: { ...devices["Desktop Chrome"] },
			timeout: 10_000,
			testMatch: "bundle/*.test.cjs",
		},
		{
			name: "dist-esm",
			use: { ...devices["Desktop Chrome"] },
			timeout: 10_000,
			testMatch: "bundle/*.test.mjs",
		},
	],

	webServer: {
		command: "npm run serve",
		url: "http://localhost:3000",
		reuseExistingServer: !process.env.CI,
	},
});
