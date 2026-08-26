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
	}
];
