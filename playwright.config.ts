import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	/* Run tests in files in parallel */
	fullyParallel: true,
	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,
	/* No retries, so a flaky test fails the build instead of passing on a retry. */
	retries: 0,
	/* Opt out of parallel tests on CI. */
	workers: process.env.CI ? 1 : undefined,
	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: "html",
	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		/* Keep the trace of a failed test. See https://playwright.dev/docs/trace-viewer */
		trace: "retain-on-failure",
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
		/* The pw-table selector engine runs inside the browser, so its tests also run on Firefox and WebKit. */
		{
			name: "firefox",
			use: { ...devices["Desktop Firefox"] },
			timeout: 15_000,
			testMatch: [
				"table-locator.test.ts",
				"table-locator-text.test.ts",
				"table-matchers.test.ts",
				"table-selector-engine.test.ts",
			],
		},
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
			timeout: 15_000,
			testMatch: [
				"table-locator.test.ts",
				"table-locator-text.test.ts",
				"table-matchers.test.ts",
				"table-selector-engine.test.ts",
			],
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
