import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { LocPathFilter } from '../../src/core/locScan/filtering/locPathFilter';
import { loadGitIgnoreRules } from '../../src/core/locScan/filtering/gitignore';
import { NodeFsPort } from '../../src/extension/platform/nodeFsPort';

async function createTempRoot(t: test.TestContext, gitignore: string): Promise<{ root: string; rules: Awaited<ReturnType<typeof loadGitIgnoreRules>> }> {
	const base = path.resolve('out-test', 'tmp');
	await fs.mkdir(base, { recursive: true });
	const root = await fs.mkdtemp(path.join(base, 'locfilter-'));
	t.after(async () => {
		await fs.rm(root, { recursive: true, force: true });
	});
	await fs.writeFile(path.join(root, '.gitignore'), gitignore);
	const rules = await loadGitIgnoreRules(root, new NodeFsPort());
	return { root, rules };
}

test('LocPathFilter: skips default excluded directories', async () => {
	const filter = new LocPathFilter();
	const noRules: any[] = [];

	assert.equal(filter.shouldSkip('node_modules/pkg/index.js', noRules), true);
	assert.equal(filter.shouldSkip('.git/config', noRules), true);
	assert.equal(filter.shouldSkip('dist/app.js', noRules), true);
	assert.equal(filter.shouldSkip('out/webview/webview.js', noRules), true);
	assert.equal(filter.shouldSkip('coverage/lcov.info', noRules), true);

	// Regression: regex metacharacters in excludes (e.g. `.git`) must be treated literally.
	assert.equal(filter.shouldSkip('agit/config', noRules), false);
	assert.equal(filter.shouldSkip('avscode/settings.json', noRules), false);

	assert.equal(filter.shouldSkip('src/node_modules_fake/index.ts', noRules), false);
});

test('LocPathFilter: combines .gitignore rules with defaults, including negation', async (t) => {
	const { rules } = await createTempRoot(t, ['generated/', '!generated/keep.ts', ''].join('\n'));
	const filter = new LocPathFilter();

	assert.equal(filter.shouldSkip('generated/a.ts', rules), true);
	assert.equal(filter.shouldSkip('generated/keep.ts', rules), false);
	assert.equal(filter.shouldSkip('src/generated/keep.ts', rules), false);
});
