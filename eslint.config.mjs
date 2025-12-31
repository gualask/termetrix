import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
	{
		ignores: ['out', 'dist', '**/*.d.ts', 'esbuild.mjs']
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['src/extension/**/*.ts'],
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
			'no-throw-literal': 'warn'
		}
	}
];
