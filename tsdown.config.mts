import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["cjs", "esm"],
	tsconfig: "tsconfig.build.json",
	// TypeScript 7 has no compiler API, so declarations come from Oxc (requires `isolatedDeclarations`).
	dts: { generator: "oxc" },
	sourcemap: true,
	clean: true,
	outDir: "dist",
	target: "es2019",
	// Keep the file names `package.json` exports point to: `.js` for CJS, `.mjs` for ESM.
	outExtensions: ({ format }) => (format === "cjs" ? { js: ".js", dts: ".d.ts" } : { js: ".mjs", dts: ".d.mts" }),
});
