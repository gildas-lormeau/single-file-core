import js from "@eslint/js";

export default [
	{
		ignores: [
			"vendor/**",
			"zip-build/lib/**"
		]
	},
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2025,
			sourceType: "module",
			globals: {
				console: "readonly",
			}
		},
		rules: {
			"linebreak-style": [
				"error",
				"unix"
			],
			"quotes": [
				"error",
				"double"
			],
			"semi": [
				"error",
				"always"
			],
			"no-console": [
				"warn"
			],
			"no-empty": [
				"error",
				{
					"allowEmptyCatch": true
				}
			]
		}
	},
	{
		files: ["test/sfz-harness/**"],
		languageOptions: {
			globals: {
				Deno: "readonly",
				setTimeout: "readonly",
				Blob: "readonly",
				TextDecoder: "readonly",
				TextEncoder: "readonly",
				URL: "readonly",
				performance: "readonly"
			}
		},
		rules: {
			"no-console": "off"
		}
	},
	{
		files: ["test/capture/**", "test/run.js"],
		languageOptions: {
			globals: {
				Deno: "readonly",
				Response: "readonly",
				TextDecoder: "readonly",
				URL: "readonly",
				setTimeout: "readonly"
			}
		},
		rules: {
			"no-console": "off"
		}
	}
];
