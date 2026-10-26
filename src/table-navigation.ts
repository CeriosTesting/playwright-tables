import type { Locator } from "@playwright/test";

import { MIN_READ_TIMEOUT } from "./polling";
import type { LocatorRef, PaginateOptions, ScrollOptions, StableOptions } from "./table-locator.types";

/** Default time the table must stay the same after a scroll, in milliseconds. */
const DEFAULT_SCROLL_SETTLE = 50;

/** Time the table must stay the same after a page change, in milliseconds. */
const PAGE_SETTLE = 200;

/** How often the table is read while waiting for a page change, in milliseconds. */
const CHANGE_INTERVAL = 50;

/**
 * What {@link TableNavigator} needs from the table it navigates.
 * @internal
 */
export type NavigationHost = {
	root: Locator;
	/** The loading indicator of the table, if it has one. */
	loading: Locator | undefined;
	/** A fingerprint of the header keys and body cell texts; it changes when the table does. */
	fingerprint(timeout: number): Promise<string>;
	waitForStable(options: StableOptions): Promise<void>;
};

/**
 * A position of {@link TableNavigator.positions}: the page (0-based) and the scroll step on it (0 is the top).
 * @internal
 */
export type NavigationPosition = { page: number; step: number };

/** `ref` as a locator: a function is called with the table root. */
export function resolveRef(ref: LocatorRef, root: Locator): Locator {
	return typeof ref === "function" ? ref(root) : ref;
}

/**
 * Walks through every page (with `paginate`) and every scroll position (with `scroll`) of a table, so the
 * caller can read the rows in view at each position. Without either option, there is one position.
 * @internal
 */
export class TableNavigator {
	constructor(
		private readonly host: NavigationHost,
		private readonly paginate: PaginateOptions | undefined,
		private readonly scroll: ScrollOptions | undefined
	) {
		checkLimit("paginate.maxPages", paginate?.maxPages);
		checkLimit("scroll.maxSteps", scroll?.maxSteps);
	}

	/** Whether the table has pages or scrolls, so the rows in view may not be all rows. */
	get active(): boolean {
		return this.paginate !== undefined || this.scroll !== undefined;
	}

	/**
	 * Goes to the first page (if `paginate.first` is set) and the top, then yields every position in turn:
	 * each scroll step down, then the next page, until the last page, `paginate.maxPages` or `deadline`. On
	 * each page, it scrolls down until the bottom or `scroll.maxSteps`. The table has settled at every
	 * position. Stops early when the caller breaks out of the loop.
	 *
	 * @throws Error if the table doesn't change after going to the next page, or the deadline passes.
	 */
	async *positions(deadline: number): AsyncGenerator<NavigationPosition> {
		await this.goToFirstPage(deadline);
		const maxPages = this.paginate?.maxPages ?? Infinity;
		const maxSteps = this.scroll?.maxSteps ?? Infinity;
		for (let page = 0; ; page++) {
			if (this.scroll !== undefined) await this.scrollToTop(deadline);
			yield { page, step: 0 };
			for (let step = 1; this.scroll !== undefined && step <= maxSteps; step++) {
				if (!(await this.scrollDown(deadline))) break;
				yield { page, step };
			}
			if (this.paginate === undefined || page + 1 >= maxPages || (await this.isLastPage())) return;
			await this.nextPage(deadline);
		}
	}

	/** The limits that ended the navigation at `last`, for a message, such as `; paginate.maxPages is 3`. */
	limitsReached(last: NavigationPosition): string {
		const notes: string[] = [];
		if (this.paginate?.maxPages === last.page + 1) notes.push(`paginate.maxPages is ${this.paginate.maxPages}`);
		if (this.scroll?.maxSteps === last.step) notes.push(`scroll.maxSteps is ${this.scroll.maxSteps}`);
		return notes.map(note => `; ${note}`).join("");
	}

	private async goToFirstPage(deadline: number): Promise<void> {
		const first = this.paginate?.first;
		if (first === undefined) return;
		const control = resolveRef(first, this.host.root);
		if (await isUnavailable(control)) return;
		const before = await this.host.fingerprint(remaining(deadline));
		await control.click({ timeout: remaining(deadline) });
		// Already on the first page, the control may still be enabled: a table that doesn't change is fine.
		await this.waitForChange(before, Math.min(deadline, Date.now() + 2_000), false);
		await this.settle(PAGE_SETTLE, deadline);
	}

	private async isLastPage(): Promise<boolean> {
		if (this.paginate === undefined) return true;
		const next = resolveRef(this.paginate.next, this.host.root);
		return this.paginate.isLastPage === undefined ? isUnavailable(next) : this.paginate.isLastPage(next);
	}

	private async nextPage(deadline: number): Promise<void> {
		if (this.paginate === undefined) return;
		const next = resolveRef(this.paginate.next, this.host.root);
		const before = await this.host.fingerprint(remaining(deadline));
		await next.click({ timeout: remaining(deadline) });
		await this.waitForChange(before, deadline, true);
		await this.settle(PAGE_SETTLE, deadline);
	}

	private container(): Locator {
		const container = this.scroll?.container;
		return container === undefined ? this.host.root : resolveRef(container, this.host.root);
	}

	private async scrollToTop(deadline: number): Promise<void> {
		await this.scrollTo(null, deadline);
	}

	/** Scrolls one step down. Returns `false` at the bottom. */
	private scrollDown(deadline: number): Promise<boolean> {
		return this.scrollTo(this.scroll?.step ?? 0, deadline);
	}

	/**
	 * Scrolls to the top (`step` is `null`) or one step down (`0` for the default step), and waits until the
	 * grid has rendered the rows in view: two animation frames, which is when grids render after a scroll
	 * event, and then until the table stays the same for `settle` (and the loading indicator is hidden).
	 * Returns whether the container scrolled.
	 */
	private async scrollTo(step: number | null, deadline: number): Promise<boolean> {
		const moved = await this.container().evaluate(
			async (element: Element, delta: number | null) => {
				const top = element.scrollTop;
				const by = delta !== null && delta > 0 ? delta : Math.max(1, Math.floor(element.clientHeight * 0.9));
				element.scrollTop = delta === null ? 0 : top + by;
				if (element.scrollTop === top) return false;
				// Animation frames don't run in a page that is not shown, so a timer ends the wait too. This
				// function runs in the browser, so it cannot use module constants.
				const frame = (): Promise<void> =>
					new Promise(resolve => {
						requestAnimationFrame(() => resolve());
						setTimeout(resolve, 50);
					});
				await frame();
				await frame();
				return true;
			},
			step,
			{ timeout: remaining(deadline) }
		);
		const settle = this.scroll?.settle ?? DEFAULT_SCROLL_SETTLE;
		if (moved && (settle > 0 || this.host.loading !== undefined)) await this.settle(settle, deadline);
		return moved;
	}

	private settle(quiet: number, deadline: number): Promise<void> {
		return this.host.waitForStable({ quiet, timeout: remaining(deadline), loading: this.host.loading });
	}

	/**
	 * Waits until the fingerprint differs from `before`.
	 * @throws Error at `deadline` if `required` and the table didn't change.
	 */
	private async waitForChange(before: string, deadline: number, required: boolean): Promise<void> {
		for (;;) {
			const current = await this.host.fingerprint(remaining(deadline)).catch(() => before);
			if (current !== before) return;
			if (Date.now() >= deadline) break;
			await new Promise(resolve => setTimeout(resolve, CHANGE_INTERVAL));
		}
		if (required) {
			throw new Error(
				`TableLocator: the table did not change after going to the next page.\n` +
					`Next page locator: ${this.paginate === undefined ? "" : resolveRef(this.paginate.next, this.host.root).toString()}\n` +
					`Table locator: ${this.host.root.toString()}`
			);
		}
	}
}

/** @throws Error if a limit is set, but is not a positive integer. */
function checkLimit(name: string, limit: number | undefined): void {
	if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
		throw new Error(`${name} must be a positive integer, got: ${limit}`);
	}
}

/** Whether a control is missing, hidden or disabled (with `disabled` or `aria-disabled="true"`). */
async function isUnavailable(control: Locator): Promise<boolean> {
	if ((await control.count()) === 0) return true;
	const first = control.first();
	if (!(await first.isVisible())) return true;
	if ((await first.getAttribute("aria-disabled")) === "true") return true;
	return first.isDisabled().catch(() => false);
}

/** The time left until `deadline`, at least {@link MIN_READ_TIMEOUT}. */
function remaining(deadline: number): number {
	return Math.max(MIN_READ_TIMEOUT, deadline - Date.now());
}
