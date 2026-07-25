import eslint from "@eslint/js";
import n from "eslint-plugin-n";
import tseslint from "typescript-eslint";
import semver from "semver";

import manifest from "./package.json" with { type: "json" };

const MIN_NODE_VERSION = semver.minVersion(manifest.engines.node).version;

export default tseslint.config(
	{
		ignores: ["**/node_modules/**", "**/dist/**", "**/.test-dist/**"],
	},
	eslint.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	{
		files: ["packages/**/*.ts", "tests/**/*.ts"],
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.eslint.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			/** Generic rules */
			eqeqeq: "error",
			"no-console": "error",
			"no-eval": "error",
			/** Ported from deno lint */
			"no-import-assign": "error",
			"no-inner-declarations": "error",
			"no-restricted-globals": ["error", "window"],
			"no-sparse-arrays": "error",
			"no-unreachable": "error",
			"no-unsafe-negation": "error",
			"@typescript-eslint/adjacent-overload-signatures": "error",
			/** Typescript rules */
			"@typescript-eslint/consistent-type-imports": "error",
			"@typescript-eslint/explicit-module-boundary-types": "error",
			"@typescript-eslint/await-thenable": "off",
			"@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "always" }],
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-non-null-assertion": "error",
			"@typescript-eslint/no-unnecessary-boolean-literal-compare": "off",
			"@typescript-eslint/no-unnecessary-condition": "off",
			"@typescript-eslint/no-unnecessary-type-assertion": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
		},
	},
	{
		files: ["packages/*/src/**/*.ts"],
		plugins: { n },
		rules: {
			/** Strict deno compatibility (did not error under denolint) */
			"n/prefer-node-protocol": "error",
			"n/file-extension-in-import": ["error", "always"],
			/** Strict node compatibility */
			"n/no-deprecated-api": "error",
			"n/no-extraneous-import": "error",
			"n/no-missing-import": "error",
			"n/no-process-env": "error",
			"n/no-sync": "error",
			"n/no-top-level-await": [
				"error",
				{ convertPath: [{ include: ["**/src/**/*.ts"], replace: ["src/(.*)\\.ts$", "dist/$1.js"] }] },
			],
			"n/no-unpublished-import": [
				"error",
				{ convertPath: [{ include: ["**/src/**/*.ts"], replace: ["src/(.*)\\.ts$", "dist/$1.js"] }] },
			],
			"n/no-unsupported-features/es-builtins": ["error", { version: MIN_NODE_VERSION }],
			"n/no-unsupported-features/es-syntax": ["error", { version: MIN_NODE_VERSION }],
			"n/no-unsupported-features/node-builtins": ["error", { version: MIN_NODE_VERSION }],
			"no-restricted-globals": [
				"error",
				"window",
				"__dirname",
				"__filename",
				"module",
				"exports",
				"require",
				"global",
				"Buffer",
				"process",
				"setImmediate",
				"clearImmediate",
			],
		},
	},
	{
		files: ["**/tests/**/*.ts", "tests/**/*.ts"],
		rules: {
			"@typescript-eslint/no-floating-promises": "off",
			"@typescript-eslint/no-empty-object-type": "off",
			"@typescript-eslint/no-misused-spread": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unnecessary-type-conversion": "off",
			"@typescript-eslint/no-unnecessary-type-parameters": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/require-await": "off",
		},
	},
);
