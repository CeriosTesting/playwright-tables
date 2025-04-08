import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [dts({ tsconfigPath: "./tsconfig.lib.json", insertTypesEntry: true })],
	build: {
		lib: {
			entry: resolve(__dirname, "src/main.ts"),
			name: "PlaywrightTables",
			fileName: "playwright-tables",
			formats: ["es", "umd"],
		},
	},
});
