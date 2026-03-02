import test from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { CanonicalPath } from '../../src/core/shared/pathing/canonicalPath';
import { ScanRoot } from '../../src/core/shared/pathing/scanRoot';
import {
	parsePanelTargetPath,
	resolvePanelTargetPath,
} from '../../src/extension/vscode/metricsPanel/commands/panelTargetPath';

test('canonicalPath: isWithin accepts root and descendants', () => {
	const root = path.resolve('tmp-root');
	const canonicalRoot = CanonicalPath.from(root);
	assert.equal(CanonicalPath.from(root).isWithin(canonicalRoot), true);
	assert.equal(CanonicalPath.from(path.join(root, 'a', 'b')).isWithin(canonicalRoot), true);
});

test('canonicalPath: isWithin rejects sibling paths (no prefix false positives)', () => {
	const root = path.resolve('tmp-root');
	const canonicalRoot = CanonicalPath.from(root);
	assert.equal(CanonicalPath.from(path.resolve('tmp-root-2')).isWithin(canonicalRoot), false);
	assert.equal(CanonicalPath.from(path.resolve('tmp-rootness', 'x')).isWithin(canonicalRoot), false);
});

test('scanRoot: resolvePathIfWithinRoot blocks traversal outside root', () => {
	const root = path.resolve('tmp-root');
	const scanRoot = ScanRoot.fromPath(root);
	assert.ok(scanRoot);
	assert.equal(scanRoot.resolvePathIfWithinRoot('..'), undefined);
	assert.equal(scanRoot.resolvePathIfWithinRoot('../etc/passwd'), undefined);
});

test('scanRoot: resolvePathIfWithinRoot normalizes absolute paths inside root', () => {
	const root = path.resolve('tmp-root');
	const scanRoot = ScanRoot.fromPath(root);
	assert.ok(scanRoot);
	const inside = path.join(root, 'a', 'b', '..', 'c');
	assert.equal(scanRoot.resolvePathIfWithinRoot(inside), path.join(root, 'a', 'c'));
	assert.equal(scanRoot.resolvePathIfWithinRoot(path.resolve(root, '..', 'outside')), undefined);
});


test(
	'canonicalPath: isWithin is case-insensitive on Windows',
	{ skip: process.platform !== 'win32' },
	() => {
		const root = CanonicalPath.from('C:\\Tmp\\Root');
		assert.equal(CanonicalPath.from('c:\\tmp\\root').isWithin(root), true);
		assert.equal(CanonicalPath.from('c:\\tmp\\root\\a\\b').isWithin(root), true);
		assert.equal(CanonicalPath.from('c:\\tmp\\rootness\\x').isWithin(root), false);
	}
);

test(
	'scanRoot: resolvePathIfWithinRoot accepts casing differences on Windows',
	{ skip: process.platform !== 'win32' },
	() => {
		const root = ScanRoot.fromPath('C:\\Tmp\\Root');
		assert.ok(root);
		assert.equal(root.resolvePathIfWithinRoot('c:\\tmp\\root\\a\\c')?.toLowerCase(), 'c:\\tmp\\root\\a\\c');
		assert.equal(root.resolvePathIfWithinRoot('c:\\tmp\\outside'), undefined);
	}
);

test('panelTargetPath: parses valid input and blocks empty payloads', () => {
	assert.equal(parsePanelTargetPath(undefined), undefined);
	assert.equal(parsePanelTargetPath(42), undefined);
	assert.equal(parsePanelTargetPath(''), undefined);
	assert.equal(parsePanelTargetPath('src/index.ts'), 'src/index.ts');
});

test('panelTargetPath: resolves only paths within root', () => {
	const root = path.resolve('tmp-root');
	const target = parsePanelTargetPath('src/app.ts');
	assert.ok(target);
	assert.equal(resolvePanelTargetPath(root, target), path.join(root, 'src', 'app.ts'));

	const escaped = parsePanelTargetPath('../etc/passwd');
	assert.ok(escaped);
	assert.equal(resolvePanelTargetPath(root, escaped), undefined);
});

test('scanRoot: normalizes equivalent paths to the same key', () => {
	const rootA = ScanRoot.fromPath(path.join('tmp-root', '.'));
	const rootB = ScanRoot.fromPath(path.join('tmp-root', 'nested', '..'));

	assert.ok(rootA);
	assert.ok(rootB);
	assert.equal(rootA.key, rootB.key);
	assert.equal(rootA.equals(rootB), true);
});

test('canonicalPath: keeps root boundaries and computes stable relatives', () => {
	const root = CanonicalPath.from(path.resolve('tmp-root'));
	const nested = CanonicalPath.from(path.join(root.raw, 'src', '..', 'src', 'index.ts'));
	const sibling = CanonicalPath.from(path.resolve('tmp-root-2'));

	assert.equal(nested.isWithin(root), true);
	assert.equal(nested.relativeTo(root), path.join('src', 'index.ts'));
	assert.equal(sibling.isWithin(root), false);
	assert.equal(sibling.relativeTo(root), undefined);
});

test(
	'scanRoot: key comparison is case-insensitive on Windows',
	{ skip: process.platform !== 'win32' },
	() => {
		const upper = ScanRoot.fromPath('C:\\Tmp\\Root');
		const lower = ScanRoot.fromPath('c:\\tmp\\root');
		assert.ok(upper);
		assert.ok(lower);
		assert.equal(upper.key, lower.key);
		assert.equal(upper.equals(lower), true);
	}
);
