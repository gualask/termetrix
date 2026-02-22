/**
 * esbuild configuration for unit tests (Node.js).
 * Bundles TS test entrypoints into `out-test/` so they are easy to run via `node --test`.
 */
import process from 'node:process';
import console from 'node:console';
import fs from 'node:fs';
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

function getUnitTestEntrypoints() {
	return fs
		.readdirSync('test/unit')
		.filter((name) => name.endsWith('.test.ts'))
		.sort()
		.map((name) => `test/unit/${name}`);
}

async function run() {
	// Avoid stale compiled tests (e.g., renamed files) causing duplicate runs.
	fs.rmSync('out-test/tests', { recursive: true, force: true });
	const entryPoints = getUnitTestEntrypoints();

	const ctx = await esbuild.context({
		entryPoints,
		bundle: true,
		platform: 'node',
		format: 'cjs',
		target: 'node22',
		outdir: 'out-test/tests',
		entryNames: '[name]',
		sourcemap: false,
		logLevel: 'info',
		external: ['vscode'],
	});

	if (watch) {
		await ctx.watch();
		console.log('👀 Watching unit tests...');
		return;
	}

	try {
		await ctx.rebuild();
	} finally {
		await ctx.dispose();
	}
}

run().catch((err) => {
	console.error('❌ Unit test build failed:', err);
	process.exit(1);
});
