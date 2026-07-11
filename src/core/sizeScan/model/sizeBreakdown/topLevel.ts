import * as path from 'node:path';
import { SIZE_BREAKDOWN_ROOT_SEGMENT } from '../../../../shared/contracts/sizeBreakdown';
import type { CanonicalPath } from '../../../shared/pathing/canonicalPath';
import type { DirectoryMetricsSnapshot } from '../../types';
import { DirectoryAggregate, type DirectoryAggregateSnapshot } from './directoryAggregate';
import type { CandidateDirectory } from './types';

/**
 * Returns the first path segment under `root` for an absolute path (or `undefined` if invalid).
 * Used to group directory metrics by top-level folder in the UI.
 * @param root - Canonical scan root path.
 * @param absolutePath - Directory absolute path.
 * @returns Top-level segment name.
 */
function getTopLevelSegment(root: CanonicalPath, absolutePath: string): string | undefined {
	const isWin = process.platform === 'win32';
	const rootRaw = root.raw;
	const absRaw = absolutePath;
	// On Windows, filesystem paths are usually case-insensitive, but we still want to preserve the
	// original segment casing for display. We compare using a lowercased "key" but slice segments
	// from the original raw path.
	const rootKey = isWin ? rootRaw.toLowerCase() : rootRaw;
	const absKey = isWin ? absRaw.toLowerCase() : absRaw;

	if (absKey === rootKey) return SIZE_BREAKDOWN_ROOT_SEGMENT;

	const rootPrefixRaw = rootRaw.endsWith(path.sep) ? rootRaw : rootRaw + path.sep;
	const rootPrefixKey = isWin ? rootPrefixRaw.toLowerCase() : rootPrefixRaw;
	if (!absKey.startsWith(rootPrefixKey)) return undefined;

	// Slice from the raw string so we preserve segment casing even on Windows.
	const relative = absRaw.slice(rootPrefixRaw.length);
	if (!relative) return undefined;

	// Be tolerant of mixed separators in inputs (we already normalize where possible, but
	// defensive code here avoids subtle grouping bugs).
	const slashIndex = relative.indexOf('/');
	const backslashIndex = relative.indexOf('\\');
	const sepIndex =
		slashIndex === -1 ? backslashIndex : backslashIndex === -1 ? slashIndex : Math.min(slashIndex, backslashIndex);
	return sepIndex === -1 ? relative : relative.slice(0, sepIndex);
}

function getAggregate(map: Map<string, DirectoryAggregate>, seg: string): DirectoryAggregate {
	return map.get(seg) ?? DirectoryAggregate.empty();
}

function bumpTotals(
	totalsBySeg: Map<string, DirectoryAggregate>,
	seg: string,
	metrics: DirectoryAggregateSnapshot,
): void {
	totalsBySeg.set(seg, getAggregate(totalsBySeg, seg).merge(DirectoryAggregate.fromTotals(metrics)));
}

/**
 * Aggregates totals for each top-level segment under `rootPath`.
 * Totals are computed from per-directory "direct" values collected during scanning.
 * @param root - Canonical scan root path.
 * @param directoryMetrics - Collected per-directory metrics.
 * @returns Map of totals by top-level segment name.
 */
export function computeTopLevelTotals(
	root: CanonicalPath,
	directoryMetrics: DirectoryMetricsSnapshot,
): Map<string, DirectoryAggregate> {
	const aggregateBySeg = new Map<string, DirectoryAggregate>();

	for (const dirPath in directoryMetrics) {
		const metrics = directoryMetrics[dirPath];
		if (metrics.bytes <= 0) continue;
		const seg = getTopLevelSegment(root, dirPath);
		if (!seg) continue;
		bumpTotals(aggregateBySeg, seg, metrics);
	}

	return aggregateBySeg;
}

/**
 * Builds a flat list of candidate directories for each top-level segment.
 * Candidates represent directories with non-zero direct bytes (not recursive totals).
 * @param root - Canonical scan root path.
 * @param directoryMetrics - Collected per-directory metrics.
 * @returns Map of candidate directories by top-level segment name.
 */
export function computeCandidatesByTopLevel(
	root: CanonicalPath,
	directoryMetrics: DirectoryMetricsSnapshot,
): Map<string, CandidateDirectory[]> {
	const candidatesBySeg = new Map<string, CandidateDirectory[]>();

	for (const dirPath in directoryMetrics) {
		const metrics = directoryMetrics[dirPath];
		if (metrics.bytes <= 0) continue;
		const seg = getTopLevelSegment(root, dirPath);
		if (!seg) continue;
		const list = candidatesBySeg.get(seg);
		const candidate: CandidateDirectory = {
			absolutePath: dirPath,
			totals: DirectoryAggregate.fromTotals(metrics),
		};
		if (list) list.push(candidate);
		else candidatesBySeg.set(seg, [candidate]);
	}

	return candidatesBySeg;
}
