import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
	{
		ignores: ['out', 'dist', '**/*.d.ts', 'esbuild.mjs']
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['src/extension/**/*.ts', 'src/core/**/*.ts', 'src/protocol/**/*.ts'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			parserOptions: {
				project: ['tsconfig.extension.json']
			}
		},
		rules: {
			'@typescript-eslint/naming-convention': [
				'warn',
				{ selector: 'import', format: ['camelCase', 'PascalCase'] }
			],
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			'curly': 'off',
			'eqeqeq': 'warn',
			'no-throw-literal': 'warn'
		}
	},
	{
		files: ['src/core/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{ group: ['**/extension/**'], message: 'core must not import extension layer.' },
						{ group: ['**/ui/**'], message: 'core must not import ui layer.' },
						{ group: ['**/protocol/**'], message: 'core must not import protocol layer.' }
					]
				}
			]
		}
	},
	{
		files: ['src/extension/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{ group: ['**/ui/**'], message: 'extension must not import ui layer.' },
					]
				}
			]
		}
	},
	{
		files: ['src/protocol/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{ group: ['**/core/**'], message: 'protocol must not import core layer.' },
						{ group: ['**/extension/**'], message: 'protocol must not import extension layer.' },
						{ group: ['**/ui/**'], message: 'protocol must not import ui layer.' },
					]
				}
			]
		}
	},
	{
		files: ['src/ui/**/*.ts', 'src/ui/**/*.tsx'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			parserOptions: {
				project: ['src/ui/tsconfig.json']
			},
			globals: {
				window: 'readonly',
				document: 'readonly',
				acquireVsCodeApi: 'readonly'
			}
		},
		rules: {
			'@typescript-eslint/naming-convention': [
				'warn',
				{ selector: 'import', format: ['camelCase', 'PascalCase'] }
			],
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			],
			'curly': 'off',
			'eqeqeq': 'warn',
			'no-throw-literal': 'warn',
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{ group: ['**/extension/**'], message: 'ui must not import extension layer.' },
						{ group: ['**/core/**'], message: 'ui must not import core layer.' },
					]
				}
			]
		}
	}
];
