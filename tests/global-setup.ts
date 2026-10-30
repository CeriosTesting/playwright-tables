import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Copies the third-party grid libraries that demo pages load into `tests/demo-html/vendor`, so the
 * demo server can serve them. The folder is not committed.
 */
export default function globalSetup(): void {
	const vendor = join(__dirname, "demo-html", "vendor");
	mkdirSync(vendor, { recursive: true });
	// The package doesn't export its dist folder, so it is read from node_modules directly.
	const agGrid = join(__dirname, "..", "node_modules", "ag-grid-community", "dist", "ag-grid-community.min.js");
	copyFileSync(agGrid, join(vendor, "ag-grid-community.min.js"));
}
