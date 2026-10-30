import type { Locator } from "@playwright/test";

import { describeLastError, MIN_READ_TIMEOUT } from "./polling";
import type { LocatorRef, PaginateOptions, ScrollOptions, StableOptions } from "./table-locator.types";

/** Default time the table must stay the same after a scroll, in milliseconds. */
const DEFAULT_SCROLL_SETTLE = 50;

/** Time the table must stay the same after a page change, in milliseconds. */
const PAGE_SETTLE = 200;

/** How often the table is read while waiting for a page change, in milliseconds. */
const CHANGE_INTERVAL = 50;

/**
 * How long the table may take to change after clicking `paginate.first`, in milliseconds. A table that
 * already shows the first page doesn't change, so this is how long that case waits.
 */
const FIRST_PAGE_WINDOW = 2_000;

/**
 * For a table with a `loading` indicator: how long it may take to change, or to show the indicator, after
 * clicking `paginate.first`, in milliseconds.
 */
const FIRST_PAGE_CUTOFF = 500;

/**
 * What {@link TableNavigator} needs from the table it navigates.
 * @internal
 */
export type NavigationHost = {
	root: Locator;
	/** The loading indicator of the table, if it has one. */
	loading: Locator | undefined;
	/** A fingerprint of the header keys and body cell texts, which changes when the table does, and the number of body rows. */
	fingerprint(timeout: number): Promise<{ rows: number; print: string }>;
	waitForStable(options: StableOptions): Promise<void>;
	/** Whether the loading indicator is visible now; `false` for a table without one. */
	loadingShown(): Promise<boolean>;
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
		// A step of 0 or less would be silently replaced by the default step.
		if (scroll?.step !== undefined && !(scroll.step > 0 && Number.isFinite(scroll.step))) {
			throw new Error(`scroll.step must be a positive number of pixels, got: ${scroll.step}`);
		}
		if (scroll?.settle !== undefined && !(scroll.settle >= 0 && Number.isFinite(scroll.settle))) {
			throw new Error(`scroll.settle must be a non-negative number of milliseconds, got: ${scroll.settle}`);
		}
	}

	/** Whether the table has pages or scrolls, so the rows in view may not be all rows. */
	get active(): boolean {
		return this.paginate !== undefined || this.scroll !== undefined;
	}

	/**
	 * Waits until the table settles, goes to the first page (if `paginate.first` is set) and the top, then
	 * yields every position in turn: each scroll step down, then the next page, until the last page,
	 * `paginate.maxPages` or `deadline`. On each page, it scrolls down until the bottom or `scroll.maxSteps`.
	 * The table has settled at every position. Stops early when the caller breaks out of the loop.
	 *
	 * @throws Error if the table doesn't change after going to the next page, or the deadline passes.
	 */
	async *positions(deadline: number): AsyncGenerator<NavigationPosition> {
		// A table that is still loading would be read as an empty first page, and its pager as missing.
		await this.settle(PAGE_SETTLE, deadline);
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
			if (this.paginate === undefined || page + 1 >= maxPages || (await this.isLastPage(deadline))) return;
			await this.nextPage(deadline);
		}
	}

	/**
	 * How far the navigation got, for a message: the pages (with `paginate`), the scroll steps (with
	 * `scroll`) and the limits that ended it, such as ` on 3 pages (2 scroll steps on the last page;
	 * paginate.maxPages is 3)`, or `""` without navigation.
	 */
	describeSearch(last: NavigationPosition): string {
		const notes: string[] = [];
		if (this.scroll !== undefined) {
			notes.push(
				`${last.step} scroll step${last.step === 1 ? "" : "s"}${this.paginate === undefined ? "" : " on the last page"}`
			);
		}
		if (this.paginate?.maxPages === last.page + 1) notes.push(`paginate.maxPages is ${this.paginate.maxPages}`);
		if (this.scroll?.maxSteps === last.step) notes.push(`scroll.maxSteps is ${this.scroll.maxSteps}`);
		const pages = this.paginate === undefined ? "" : ` on ${last.page + 1} page${last.page === 0 ? "" : "s"}`;
		return pages + (notes.length === 0 ? "" : ` (${notes.join("; ")})`);
	}

	/**
	 * Clicks `paginate.first`, unless the table shows the first page: with `paginate.isFirstPage`, as it
	 * says, and otherwise when the control is disabled. Then waits until the table shows the first page.
	 */
	private async goToFirstPage(deadline: number): Promise<void> {
		const first = this.paginate?.first;
		if (first === undefined) return;
		const resolved = resolveRef(first, this.host.root);
		// A pager above and below the table matches twice, and both do the same.
		const control = resolved.first();
		const isFirstPage = this.paginate?.isFirstPage;
		if (isFirstPage === undefined ? await isUnavailable(control, deadline) : await isFirstPage(resolved)) return;
		const before = await this.host.fingerprint(remaining(deadline));
		await control.click({ timeout: remaining(deadline) });
		if (isFirstPage === undefined) {
			await this.waitForFirstPageChange(before.print, deadline);
		} else {
			await this.waitForFirstPage(resolved, isFirstPage, deadline);
		}
		await this.settle(PAGE_SETTLE, deadline);
	}

	/**
	 * Waits until `isFirstPage` says the table shows the first page.
	 * @throws Error at `deadline` if it never does.
	 */
	private async waitForFirstPage(
		first: Locator,
		isFirstPage: (first: Locator) => Promise<boolean>,
		deadline: number
	): Promise<void> {
		let lastError: unknown;
		for (;;) {
			try {
				if (await isFirstPage(first)) return;
				lastError = undefined;
			} catch (error) {
				lastError = error;
			}
			if (Date.now() >= deadline) break;
			await new Promise(resolve => setTimeout(resolve, CHANGE_INTERVAL));
		}
		throw new Error(
			`TableLocator: the table did not show the first page after clicking paginate.first ` +
				`(paginate.isFirstPage stayed false).\n` +
				describeLastError(lastError) +
				`First page locator: ${first.toString()}\n` +
				`Table locator: ${this.host.root.toString()}`
		);
	}

	/**
	 * After clicking `paginate.first` without `paginate.isFirstPage`: waits for the table to change, which it
	 * doesn't when it already showed the first page and the control stays enabled. So the wait has a window:
	 * {@link FIRST_PAGE_WINDOW}, or, for a table with a `loading` indicator, {@link FIRST_PAGE_CUTOFF} as long
	 * as the indicator doesn't show (a page that loads shows it).
	 */
	private async waitForFirstPageChange(before: string, deadline: number): Promise<void> {
		const window = Math.min(deadline, Date.now() + FIRST_PAGE_WINDOW);
		const cutoff = this.host.loading === undefined ? window : Math.min(window, Date.now() + FIRST_PAGE_CUTOFF);
		let loading = false;
		for (;;) {
			const current = await this.host.fingerprint(remaining(window)).catch(() => undefined);
			if (current !== undefined && current.print !== before) return;
			if (!loading && this.host.loading !== undefined) loading = await this.host.loadingShown().catch(() => false);
			if (Date.now() >= (loading ? window : cutoff)) return;
			await new Promise(resolve => setTimeout(resolve, CHANGE_INTERVAL));
		}
	}

	private async isLastPage(deadline: number): Promise<boolean> {
		if (this.paginate === undefined) return true;
		const next = resolveRef(this.paginate.next, this.host.root);
		return this.paginate.isLastPage === undefined
			? isUnavailable(next.first(), deadline)
			: this.paginate.isLastPage(next);
	}

	private async nextPage(deadline: number): Promise<void> {
		if (this.paginate === undefined) return;
		// A pager above and below the table matches twice, and both do the same.
		const next = resolveRef(this.paginate.next, this.host.root).first();
		const before = await this.host.fingerprint(remaining(deadline));
		await next.click({ timeout: remaining(deadline) });
		await this.waitForChange(before.print, deadline, true);
		await this.settle(PAGE_SETTLE, deadline);
	}

	private container(): Locator {
		const container = this.scroll?.container;
		return container === undefined ? this.host.root : resolveRef(container, this.host.root);
	}

	private async scrollToTop(deadline: number): Promise<void> {
		await this.checkScrollable(deadline);
		await this.scrollTo(null, deadline);
	}

	/**
	 * @throws Error if the scroll container can never scroll (`overflow-y: visible` or `clip`), which would
	 * read only the rows in view, naming the nearest element around or inside it that does scroll.
	 */
	private async checkScrollable(deadline: number): Promise<void> {
		const problem = await this.container().evaluate(
			(element: Element) => {
				// The page itself scrolls with any overflow.
				if (element === document.scrollingElement) return null;
				const overflow = getComputedStyle(element).overflowY;
				if (overflow !== "visible" && overflow !== "clip") return null;
				// This function runs in the browser, so it cannot use module functions.
				const scrolls = (el: Element): boolean =>
					/^(auto|scroll|overlay)$/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight;
				let hint: Element | null = null;
				for (let el = element.parentElement; el !== null && hint === null; el = el.parentElement) {
					if (el !== document.scrollingElement && scrolls(el)) hint = el;
				}
				hint ??= Array.from(element.querySelectorAll("*")).find(scrolls) ?? null;
				const name =
					hint === null
						? null
						: hint.localName +
							(hint.id === "" ? "" : "#" + hint.id) +
							Array.from(hint.classList)
								.slice(0, 2)
								.map(name => "." + name)
								.join("");
				return { overflow, hint: name };
			},
			undefined,
			{ timeout: remaining(deadline) }
		);
		if (problem === null) return;
		throw new Error(
			`TableLocator: the scroll container can't scroll (overflow-y: ${problem.overflow}), so only the rows in view ` +
				`would be read. Point scroll.container at the element that scrolls` +
				(problem.hint === null ? "." : `, such as ${problem.hint}.`) +
				`\nScroll container: ${this.container().toString()}` +
				(this.scroll?.container === undefined ? " (the table root, as scroll.container is not set)" : "") +
				`\nTable locator: ${this.host.root.toString()}`
		);
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
				// With `scroll-behavior: smooth`, setting scrollTop would only start an animation.
				element.scrollTo({ top: delta === null ? 0 : top + by, behavior: "instant" });
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
	 * Waits until the fingerprint differs from `before`. With `required` (after going to the next page), it
	 * also waits until the table has body rows again: a table that clears its rows while it loads the next
	 * page has changed, but doesn't show that page yet.
	 * @throws Error at `deadline` if `required` and the table didn't change.
	 */
	private async waitForChange(before: string, deadline: number, required: boolean): Promise<void> {
		let lastError: unknown;
		let changed = false;
		for (;;) {
			try {
				const current = await this.host.fingerprint(remaining(deadline));
				lastError = undefined;
				if (current.print !== before) {
					changed = true;
					if (!required || current.rows > 0) return;
				}
			} catch (error) {
				// The table may be rendered again while it changes pages: keep trying, but remember why.
				lastError = error;
			}
			if (Date.now() >= deadline) break;
			await new Promise(resolve => setTimeout(resolve, CHANGE_INTERVAL));
		}
		// It changed but stayed empty: an empty next page, rare as that is.
		if (!required || changed) return;
		throw new Error(
			`TableLocator: the table did not change after going to the next page.\n` +
				`Next page locator: ${this.paginate === undefined ? "" : resolveRef(this.paginate.next, this.host.root).toString()}\n` +
				describeLastError(lastError) +
				`Table locator: ${this.host.root.toString()}`
		);
	}
}

/** @throws Error if a limit is set, but is not a positive integer. */
function checkLimit(name: string, limit: number | undefined): void {
	if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
		throw new Error(`${name} must be a positive integer, got: ${limit}`);
	}
}

/**
 * Whether a control (one element) is missing, hidden or disabled: with `disabled`, `aria-disabled="true"`
 * or the `disabled` class, on the control or an element around it, such as a Bootstrap
 * `<li class="disabled">` around a link. Doesn't wait for the control to show up.
 */
async function isUnavailable(control: Locator, deadline: number): Promise<boolean> {
	if ((await control.count()) === 0 || !(await control.isVisible())) return true;
	try {
		return await control.evaluate(
			element => element.closest(":disabled, [aria-disabled=true], .disabled") !== null,
			undefined,
			{ timeout: remaining(deadline) }
		);
	} catch (error) {
		// Gone since it was counted (the pager was rendered again): missing. Otherwise the read failed, and
		// guessing "enabled" would click a disabled control and wait for a page that never comes.
		if ((await control.count()) === 0) return true;
		throw error;
	}
}

/** The time left until `deadline`, at least {@link MIN_READ_TIMEOUT}. */
function remaining(deadline: number): number {
	return Math.max(MIN_READ_TIMEOUT, deadline - Date.now());
}
