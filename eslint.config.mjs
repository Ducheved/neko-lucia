import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

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
			eqeqeq: "error",
			"no-console": "error",
			"no-eval": "error",
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
