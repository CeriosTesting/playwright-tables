import { test as base, selectors as defaultSelectors, Selectors } from "@playwright/test";

import { TABLE_SELECTOR_ENGINE_NAME, tableSelectorEngine } from "./table-selector-engine";

const registrations = new WeakMap<Selectors, Promise<void>>();

/**
 * Registers the `pw-table` selector engine used by {@link TableLocator}.
 *
 * Safe to call more than once: later calls reuse the first registration, and an
 * "already registered" error (for example from another copy of this package) is ignored.
 *
 * Registration must happen **before the page is created**. You don't need this function if you
 * import `test` from this package, which registers the engine with a worker-scoped auto fixture.
 *
 * @param target - The Playwright `selectors` object to register on. Defaults to `selectors` from `@playwright/test`.
 * @returns A promise that resolves once the engine is registered.
 *
 * @example
 * // With your own test fixtures
 * import { test as base } from "@playwright/test";
 * import { registerTableSelectors } from "@cerios/playwright-table";
 *
 * export const test = base.extend<{}, { tableSelectors: void }>({
 *   tableSelectors: [async ({ playwright }, use) => {
 *     await registerTableSelectors(playwright.selectors);
 *     await use();
 *   }, { scope: "worker", auto: true }],
 * });
 *
 * @example
 * // Without fixtures
 * test.beforeAll(async () => {
 *   await registerTableSelectors();
 * });
 */
export function registerTableSelectors(target: Selectors = defaultSelectors): Promise<void> {
	let registration = registrations.get(target);
	if (registration === undefined) {
		// Run in an isolated world: Firefox evaluates custom engines with eval(), which a strict page CSP
		// blocks in the main world. The isolated world shares the DOM, which is all the engine needs.
		const options = { contentScript: true };
		registration = target.register(TABLE_SELECTOR_ENGINE_NAME, tableSelectorEngine, options).catch((error: unknown) => {
			if (error instanceof Error && /already registered/.test(error.message)) {
				return;
			}
			registrations.delete(target);
			throw error;
		});
		registrations.set(target, registration);
	}
	return registration;
}

/**
 * Playwright `test` with the `pw-table` selector engine registered for every worker, so
 * {@link TableLocator} works without any setup. Use it instead of `test` from `@playwright/test`.
 *
 * The engine is registered by a worker-scoped auto fixture, so it is always registered before
 * any page is created.
 *
 * @example
 * import { test, expect, defineTable } from "@cerios/playwright-table";
 *
 * test("shows the user", async ({ page }) => {
 *   const users = defineTable(page.locator("table"), { headers: ["Name", "Status"] });
 *   await expect(users.row({ Name: "John" }).cell("Status")).toHaveText("Active");
 * });
 */
export const test = base.extend<{}, { _pwTableSelectors: void }>({
	_pwTableSelectors: [
		async ({ playwright }, use) => {
			await registerTableSelectors(playwright.selectors);
			await use();
		},
		{ scope: "worker", auto: true },
	],
});
