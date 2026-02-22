import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { scanProjectSize } from '../../src/core/sizeScan/engine/scanEngine';
import { SIZE_SCAN_DEFAULTS } from '../../src/shared/contracts/sizeScanDefaults';
import { NodeFsPort } from '../../src/extension/platform/nodeFsPort';

async function createTempRoot(t: test.TestContext): Promise<{ root: string; base: string }> {
	const base = path.resolve('out-test', 'tmp');
	await fs.mkdir(base, { recursive: true });
	const root = await fs.mkdtemp(path.join(base, 'sizescan-'));
	t.after(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});
	return { root, base };
}

async function writeBytes(root: string, relativePath: string, sizeBytes: number): Promise<string> {
	const absolutePath = path.join(root, relativePath);
	await fs.mkdir(path.dirname(absolutePath), { recursive: true });
	await fs.writeFile(absolutePath, Buffer.alloc(sizeBytes, 0));
	return absolutePath;
}

test('size scan: computes total bytes and directory metrics (full mode)', async (t) => {
	const { root } = await createTempRoot(t);

	await writeBytes(root, 'root.bin', 10);
	await writeBytes(root, 'dirA/file1.bin', 100);
	await writeBytes(root, 'dirA/file2.bin', 200);
	await writeBytes(root, 'dirA/empty.bin', 0);
	await writeBytes(root, 'dirB/sub/file3.bin', 300);
	await writeBytes(root, 'dirB/tiny.bin', 1);

	const result = await scanProjectSize({
		rootPath: root,
		config: {
			maxDurationSeconds: SIZE_SCAN_DEFAULTS.maxDurationSeconds,
			maxDirectories: SIZE_SCAN_DEFAULTS.maxDirectories,
			fsConcurrency: 16,
		},
		fs: new NodeFsPort(),
		cancellationToken: { isCancellationRequested: false },
	});

	assert.equal(result.incomplete, false);
	assert.equal(result.totalBytes, 611);
	assert.equal(result.metadata.directoriesScanned, 4);
	assert.equal(result.skippedCount, 0);

	assert.ok(result.directoryMetrics);
	assert.equal(result.directoryMetrics[root].bytes, 10);

	const dirA = path.join(root, 'dirA');
	assert.equal(result.directoryMetrics[dirA].bytes, 300);
	assert.equal(result.directoryMetrics[dirA].fileCount, 3);
	assert.equal(result.directoryMetrics[dirA].maxFileBytes, 200);
	assert.equal(result.directoryMetrics[dirA].maxFileName, 'file2.bin');
});

test('size scan: summary mode omits directory metrics', async (t) => {
	const { root } = await createTempRoot(t);

	await writeBytes(root, 'root.bin', 10);
	await writeBytes(root, 'dirA/file1.bin', 100);
	await writeBytes(root, 'dirA/file2.bin', 200);

	const result = await scanProjectSize({
		rootPath: root,
		config: {
			maxDurationSeconds: SIZE_SCAN_DEFAULTS.maxDurationSeconds,
			maxDirectories: SIZE_SCAN_DEFAULTS.maxDirectories,
			fsConcurrency: 16,
		},
		fs: new NodeFsPort(),
		cancellationToken: { isCancellationRequested: false },
		mode: 'summary',
	});

	assert.equal(result.incomplete, false);
	assert.equal(result.totalBytes, 310);
	assert.equal(result.directoryMetrics, undefined);
});

test('size scan: does not follow symlinks (best-effort)', async (t) => {
	const { root, base } = await createTempRoot(t);

	await writeBytes(root, 'root.bin', 10);

	const externalTarget = path.join(base, `external-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`);
	await fs.writeFile(externalTarget, Buffer.alloc(1024, 0));
	t.after(async () => {
		await fs.rm(externalTarget, { force: true });
	});

	const linkPath = path.join(root, 'link-to-external.bin');
	try {
		await fs.symlink(externalTarget, linkPath, 'file');
	} catch (error) {
		const code = (error as NodeJS.ErrnoException | null)?.code;
		t.skip(`symlink not supported in this environment (${code ?? 'unknown'})`);
	}

	const result = await scanProjectSize({
		rootPath: root,
		config: {
			maxDurationSeconds: SIZE_SCAN_DEFAULTS.maxDurationSeconds,
			maxDirectories: SIZE_SCAN_DEFAULTS.maxDirectories,
			fsConcurrency: 16,
		},
		fs: new NodeFsPort(),
		cancellationToken: { isCancellationRequested: false },
	});

	// If symlinks were followed, we'd accidentally count the external target file too.
	assert.equal(result.totalBytes, 10);
});
