import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { isGitIgnored, loadGitIgnoreRules, loadNestedGitIgnoreRules } from '../../src/core/locScan/filtering/gitignore';
import { NodeFsPort } from '../../src/extension/platform/nodeFsPort';

async function createTempRoot(t: test.TestContext): Promise<string> {
	const base = path.resolve('out-test', 'tmp');
	await fs.mkdir(base, { recursive: true });
	const root = await fs.mkdtemp(path.join(base, 'gitignore-'));
	t.after(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});
	return root;
}

test('gitignore: directory-only rules match at any depth', async (t) => {
	const root = await createTempRoot(t);
	await fs.writeFile(path.join(root, '.gitignore'), ['dist/', ''].join('\n'));

	const rules = await loadGitIgnoreRules(root, new NodeFsPort());
	assert.equal(isGitIgnored('dist/app.js', rules), true);
	assert.equal(isGitIgnored('packages/pkg/dist/app.js', rules), true);
	assert.equal(isGitIgnored('src/distinct/app.js', rules), false);
});

test('gitignore: negation overrides previous matches', async (t) => {
	const root = await createTempRoot(t);
	await fs.writeFile(path.join(root, '.gitignore'), ['dist/', '!dist/keep.txt', ''].join('\n'));

	const rules = await loadGitIgnoreRules(root, new NodeFsPort());
	assert.equal(isGitIgnored('dist/app.js', rules), true);
	assert.equal(isGitIgnored('dist/keep.txt', rules), false);
});

test('gitignore: anchored patterns apply only at repo root', async (t) => {
	const root = await createTempRoot(t);
	await fs.writeFile(path.join(root, '.gitignore'), ['/dist/', ''].join('\n'));

	const rules = await loadGitIgnoreRules(root, new NodeFsPort());
	assert.equal(isGitIgnored('dist/app.js', rules), true);
	assert.equal(isGitIgnored('packages/pkg/dist/app.js', rules), false);
});

test('gitignore: nested unanchored rule matches at any depth within subdirectory', async (t) => {
	const root = await createTempRoot(t);
	const subDir = path.join(root, 'packages', 'foo');
	await fs.mkdir(subDir, { recursive: true });
	await fs.writeFile(path.join(subDir, '.gitignore'), ['build', ''].join('\n'));

	const fsPort = new NodeFsPort();
	const nested = await loadNestedGitIgnoreRules(subDir, path.join('packages', 'foo'), fsPort);

	// Should match files inside packages/foo/build at any depth.
	assert.equal(isGitIgnored('packages/foo/build', nested), true);
	assert.equal(isGitIgnored('packages/foo/src/build', nested), true);
	// Should NOT match files outside the subdirectory.
	assert.equal(isGitIgnored('build', nested), false);
	assert.equal(isGitIgnored('packages/bar/build', nested), false);
});

test('gitignore: nested anchored rule matches only at top of subdirectory', async (t) => {
	const root = await createTempRoot(t);
	const subDir = path.join(root, 'packages', 'foo');
	await fs.mkdir(subDir, { recursive: true });
	await fs.writeFile(path.join(subDir, '.gitignore'), ['/build', ''].join('\n'));

	const fsPort = new NodeFsPort();
	const nested = await loadNestedGitIgnoreRules(subDir, path.join('packages', 'foo'), fsPort);

	// Anchored: matches packages/foo/build but not packages/foo/src/build.
	assert.equal(isGitIgnored('packages/foo/build', nested), true);
	assert.equal(isGitIgnored('packages/foo/src/build', nested), false);
	// Still does not bleed outside the subdirectory.
	assert.equal(isGitIgnored('build', nested), false);
});
