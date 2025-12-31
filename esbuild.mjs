/**
 * esbuild configuration for Termetrix
 * - Extension: Node.js CommonJS bundle
 * - Webview: Browser IIFE bundle with Preact JSX
 */
import esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function buildExtension() {
	return esbuild.context({
		entryPoints: ['src/extension/extension.ts'],
		bundle: true,
		outfile: 'out/extension.js',
		platform: 'node',
		format: 'cjs',
		target: 'node18',
		external: ['vscode'],
		sourcemap: !production,
		minify: production,
		metafile: true
	});
}

async function buildWebview() {
	return esbuild.context({
		entryPoints: ['src/ui/main.tsx'],
		bundle: true,
		outdir: 'out/webview',
		entryNames: 'webview',
		assetNames: 'webview',
		platform: 'browser',
		format: 'iife',
		sourcemap: !production,
		minify: production,
		metafile: true,
		jsx: 'automatic',
		jsxImportSource: 'preact',
		loader: { '.css': 'css' }
	});
}

async function run() {
	console.log(`\n⚡ Building Termetrix (${production ? 'production' : 'development'})...\n`);

	const [extensionCtx, webviewCtx] = await Promise.all([
		buildExtension(),
		buildWebview()
	]);

	if (watch) {
		await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
		console.log('👀 Watching for changes...');
		return;
	}

	try {
		const [extResult, webResult] = await Promise.all([
			extensionCtx.rebuild(),
			webviewCtx.rebuild()
		]);

		console.log(await esbuild.analyzeMetafile(extResult.metafile, { color: true }));
		console.log(await esbuild.analyzeMetafile(webResult.metafile, { color: true }));
	} finally {
		await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
	}
}

run().catch((err) => {
	console.error('❌ Build failed:', err);
	process.exit(1);
});
