import assert from 'node:assert/strict';
import * as path from 'node:path';
import test from 'node:test';

import { computeSizeBreakdown } from '../../src/core/sizeScan/model/sizeBreakdown/computeSizeBreakdown';
import { DirectoryAggregate } from '../../src/core/sizeScan/model/sizeBreakdown/directoryAggregate';
import { BreakdownSelectionPolicy } from '../../src/core/sizeScan/model/sizeBreakdown/options';
import { SIZE_BREAKDOWN_ROOT_SEGMENT } from '../../src/shared/contracts/sizeBreakdown';
import { formatBreakdownParentPath } from '../../src/ui/views/size/sizeFormatters';

test('sizeBreakdown: groups by top-level segment and sorts parents by bytes', () => {
	const rootPath = path.resolve('repo-root');

	const srcRoot = path.join(rootPath, 'src');
	const srcComponents = path.join(srcRoot, 'components');
	const srcGenerated = path.join(srcRoot, 'generated');
	const docsRoot = path.join(rootPath, 'docs');

	const directoryMetrics = {
		[srcRoot]: { bytes: 100, fileCount: 10, maxFileBytes: 5 },
		[srcComponents]: { bytes: 50, fileCount: 4, maxFileBytes: 20 },
		[srcGenerated]: { bytes: 25, fileCount: 6, maxFileBytes: 30 },
		[docsRoot]: { bytes: 200, fileCount: 3, maxFileBytes: 100 },
	};

	const result = computeSizeBreakdown({
		rootPath,
		directoryMetrics,
		options: {
			coverageTarget: 0.5,
			minItemPercent: 0,
			maxItems: 10,
		},
	});

	assert.equal(result.rootPath, rootPath);
	assert.equal(result.parents[0]?.path, 'docs');
	assert.equal(result.parents[1]?.path, 'src');

	const srcParent = result.parents.find((p) => p.path === 'src');
	assert.ok(srcParent);
	assert.equal(srcParent.bytes, 175);
	assert.equal(srcParent.fileCount, 20);
	assert.equal(srcParent.maxFileBytes, 30);

	const leafDirs = srcParent.entries.filter((e) => e.kind === 'leafDirectory');
	const others = srcParent.entries.find((e) => e.kind === 'others');

	assert.equal(leafDirs.length, 1);
	assert.ok(others);
	assert.equal(others.bytes, 75);
	assert.equal(others.leafDirs, 2);
	assert.equal(others.fileCount, 10);
	assert.equal(others.maxFileBytes, 30);

	// Edge case: when a segment has only its root candidate, avoid a redundant "." leaf row.
	const docsParent = result.parents.find((p) => p.path === 'docs');
	assert.ok(docsParent);
	assert.equal(docsParent.entries.length, 0);
	assert.equal(
		result.parents.some((p) => p.path === '.'),
		false,
	);
});

test('sizeBreakdown: filters out top-level segments below minItemPercent, always keeps the largest', () => {
	const rootPath = path.resolve('repo-root');

	const directoryMetrics = {
		[path.join(rootPath, 'src')]: { bytes: 900, fileCount: 10, maxFileBytes: 100 },
		[path.join(rootPath, 'node_modules')]: { bytes: 8000, fileCount: 100, maxFileBytes: 500 },
		[path.join(rootPath, '.github')]: { bytes: 50, fileCount: 2, maxFileBytes: 10 },
		[path.join(rootPath, 'scripts')]: { bytes: 50, fileCount: 3, maxFileBytes: 8 },
	};

	// Total = 9000. minItemPercent=0.05 → minBytes = 450.
	// node_modules (8000) and src (900) pass; .github (50) and scripts (50) do not.
	const result = computeSizeBreakdown({
		rootPath,
		directoryMetrics,
		options: { minItemPercent: 0.05, maxItems: 20 },
	});

	const paths = result.parents.map((p) => p.path);
	assert.ok(paths.includes('node_modules'));
	assert.ok(paths.includes('src'));
	assert.equal(paths.includes('.github'), false);
	assert.equal(paths.includes('scripts'), false);

	assert.ok(result.hiddenParents, 'hiddenParents should be set');
	assert.equal(result.hiddenParents.count, 2);
	assert.equal(result.hiddenParents.bytes, 100); // .github (50) + scripts (50)
});

test('sizeBreakdown: omits root segment even when root has direct files', () => {
	const rootPath = path.resolve('repo-root');
	const srcRoot = path.join(rootPath, 'src');
	const srcComponents = path.join(srcRoot, 'components');

	const directoryMetrics = {
		[rootPath]: { bytes: 25, fileCount: 2, maxFileBytes: 16 },
		[srcRoot]: { bytes: 100, fileCount: 10, maxFileBytes: 40 },
		[srcComponents]: { bytes: 30, fileCount: 4, maxFileBytes: 20 },
	};

	const result = computeSizeBreakdown({
		rootPath,
		directoryMetrics,
		options: {
			coverageTarget: 0.8,
			minItemPercent: 0,
			maxItems: 10,
		},
	});

	assert.equal(
		result.parents.some((p) => p.path === '.'),
		false,
	);

	assert.equal(result.parents.length, 1);
	assert.equal(result.parents[0]?.path, 'src');
	assert.equal(result.parents[0]?.bytes, 130);
});

test('sizeBreakdown policy: clamps invalid ratios and keeps positive thresholds', () => {
	const policy = BreakdownSelectionPolicy.fromRaw({
		coverageTarget: 2,
		minItemPercent: -1,
		maxItems: 0,
	});

	assert.equal(policy.coverageTarget, 1);
	assert.equal(policy.minItemPercent, 0);
	assert.equal(policy.maxItems, 1);

	assert.equal(
		policy.shouldStopBeforeSelecting({
			selectedCount: 1,
			candidateBytes: 1,
			parentBytes: 1000,
		}),
		true,
	);
});

test('directoryAggregate: merges totals with domain-safe invariants', () => {
	const aggregate = DirectoryAggregate.fromTotals({ bytes: 120, fileCount: 3, maxFileBytes: 80 });
	const remainder = aggregate.subtractSaturating(
		DirectoryAggregate.fromTotals({ bytes: 200, fileCount: 20, maxFileBytes: 0 }),
	);

	assert.equal(aggregate.bytes, 120);
	assert.equal(aggregate.fileCount, 3);
	assert.equal(aggregate.maxFileBytes, 80);

	assert.equal(remainder.bytes, 0);
	assert.equal(remainder.fileCount, 0);
	assert.equal(remainder.maxFileBytes, 80);
	assert.equal(remainder.isEmpty(), true);
});

test('formatBreakdownParentPath: maps root segment to user-friendly label', () => {
	assert.equal(formatBreakdownParentPath(SIZE_BREAKDOWN_ROOT_SEGMENT), 'Project root');
	assert.equal(formatBreakdownParentPath('src'), 'src');
});
