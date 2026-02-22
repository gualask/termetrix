import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { scanLOC } from '../../src/core/locScan/engine/locEngine';
import { NodeFsPort } from '../../src/extension/platform/nodeFsPort';

async function createTempRoot(t: test.TestContext): Promise<string> {
	const base = path.resolve('out-test', 'tmp');
	await fs.mkdir(base, { recursive: true });
	const root = await fs.mkdtemp(path.join(base, 'locengine-'));
	t.after(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});
	return root;
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
	const absolutePath = path.join(root, relativePath);
	await fs.mkdir(path.dirname(absolutePath), { recursive: true });
	await fs.writeFile(absolutePath, content, 'utf8');
}

test('scanLOC: nested .gitignore excludes files within subdirectory', async (t) => {
	const root = await createTempRoot(t);
	const fsPort = new NodeFsPort();

	// Root .gitignore excludes nothing relevant.
	await writeFile(root, '.gitignore', '');
	// Nested .gitignore inside packages/foo excludes its own generated/ folder.
	await writeFile(root, 'packages/foo/.gitignore', 'generated/\n');
	await writeFile(root, 'packages/foo/src/index.ts', 'export const x = 1;\n');
	await writeFile(root, 'packages/foo/generated/types.ts', 'export type T = string;\n');
	// packages/bar has no .gitignore; its generated/ should NOT be excluded.
	await writeFile(root, 'packages/bar/src/index.ts', 'export const y = 2;\n');
	await writeFile(root, 'packages/bar/generated/types.ts', 'export type U = number;\n');

	const result = await scanLOC({ rootPath: root, fs: fsPort, maxConcurrency: 4 });

	// Only packages/foo/generated/types.ts should be excluded.
	// Scanned: foo/src/index.ts, bar/src/index.ts, bar/generated/types.ts → 3 files.
	assert.equal(result.scannedFiles, 3);
});

test('scanLOC: concurrent traversal keeps same aggregated result as serial traversal', async (t) => {
	const root = await createTempRoot(t);

	await writeFile(root, '.gitignore', 'generated/\n');
	await writeFile(root, 'src/a.ts', ['const a = 1;', 'const b = 2;', 'const c = 3;', ''].join('\n'));
	await writeFile(root, 'src/b.js', ['export const x = 1;', 'export const y = 2;', ''].join('\n'));
	await writeFile(root, 'src/nested/c.py', ['def f():', '    return 1', 'print(f())', ''].join('\n'));
	await writeFile(root, 'src/nested/d.go', ['package main', 'func main(){}', ''].join('\n'));
	await writeFile(root, 'docs/readme.md', ['# docs', 'ignore me', ''].join('\n'));
	await writeFile(root, 'generated/skip.ts', ['const skipped = true;', ''].join('\n'));
	await writeFile(root, 'node_modules/pkg/index.js', ['module.exports = 1;', ''].join('\n'));

	const fs = new NodeFsPort();
	const serial = await scanLOC({ rootPath: root, fs, maxConcurrency: 1 });
	const concurrent = await scanLOC({ rootPath: root, fs, maxConcurrency: 8 });

	assert.equal(concurrent.totalLines, serial.totalLines);
	assert.deepEqual(concurrent.byLanguage, serial.byLanguage);
	assert.equal(concurrent.scannedFiles, serial.scannedFiles);
	assert.equal(concurrent.skippedFiles, serial.skippedFiles);
	assert.deepEqual(concurrent.topFiles, serial.topFiles);
});
