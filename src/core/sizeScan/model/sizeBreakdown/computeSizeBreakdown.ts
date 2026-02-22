import * as path from 'path';
import {
	SIZE_BREAKDOWN_ROOT_SEGMENT,
	type SizeBreakdownLeafDirectory,
	type SizeBreakdownOthers,
	type SizeBreakdownParent,
	type SizeBreakdownResult,
} from '../../../../shared/contracts/sizeBreakdown';
import { CanonicalPath } from '../../../shared/pathing/canonicalPath';
import type { DirectoryMetricsSnapshot } from '../../types';
import type { CandidateDirectory } from './types';
export type { ComputeSizeBreakdownOptions } from './options';
import {
	BreakdownPolicy,
	type ComputeSizeBreakdownOptions,
} from './options';
import {
	computeCandidatesByTopLevel,
	computeTopLevelTotals,
} from './topLevel';
import { selectLeafDirectories } from './leafSelection';
import { DirectoryAggregate } from './directoryAggregate';

export interface ComputeSizeBreakdownInput {
	rootPath: string;
	directoryMetrics: DirectoryMetricsSnapshot;
	options?: ComputeSizeBreakdownOptions;
}

/**
 * Builds the "Others" row for a parent segment, summarizing what was not selected.
 * @param params - Input values.
 * @returns "Others" entry, or undefined when there is nothing to summarize.
 */
function computeOthersRow(params: {
	parentTotals: DirectoryAggregate;
	selectedTotals: DirectoryAggregate;
	leafEntries: CandidateDirectory[];
	selectedLeafDirSet: Set<string>;
}): SizeBreakdownOthers | undefined {
	const { parentTotals, selectedTotals, leafEntries, selectedLeafDirSet } = params;

	// "Others" is relative to this top-level segment (not the full project).
	const othersTotals = parentTotals.subtractSaturating(selectedTotals);
	const othersLeafDirs = Math.max(0, leafEntries.length - selectedLeafDirSet.size);

	if (othersTotals.isEmpty() && othersLeafDirs <= 0) return undefined;

	let othersMaxFileBytes = 0;
	// Compute max file bytes among non-selected candidates to reduce "what's inside?" doubt.
	for (const candidate of leafEntries) {
		if (selectedLeafDirSet.has(candidate.absolutePath)) continue;
		if (candidate.totals.maxFileBytes > othersMaxFileBytes) othersMaxFileBytes = candidate.totals.maxFileBytes;
	}

	return {
		kind: 'others',
		bytes: othersTotals.bytes,
		fileCount: othersTotals.fileCount,
		maxFileBytes: othersMaxFileBytes,
		leafDirs: othersLeafDirs,
	};
}

/**
 * Constructs a parent segment entry and its children (selected leaf dirs + optional others row).
 * Returns `undefined` when the segment has no meaningful data.
 * @param params - Input values.
 * @returns Parent entry, or undefined when the segment has no data.
 */
function buildParentForSegment(params: {
	rootPath: string;
	seg: string;
	totals: DirectoryAggregate;
	leafEntries: CandidateDirectory[];
	directoryMetrics: DirectoryMetricsSnapshot;
	policy: BreakdownPolicy;
}): SizeBreakdownParent | undefined {
	const { rootPath, seg, totals, leafEntries, directoryMetrics, policy } = params;

	const { bytes, fileCount, maxFileBytes } = totals;
	if (bytes <= 0 && fileCount <= 0) return undefined;

	const absolutePath = seg === SIZE_BREAKDOWN_ROOT_SEGMENT ? rootPath : path.join(rootPath, seg);

	// Edge case: when the only candidate leaf directory is the segment root itself, suppress the
	// redundant "." child row — there is nothing more specific to drill into.
	if (leafEntries.length === 1 && leafEntries[0].absolutePath === absolutePath) {
		return {
			kind: 'parent',
			path: seg,
			absolutePath,
			bytes,
			fileCount,
			maxFileBytes,
			entries: [],
		};
	}

	const { selected, selectedTotals, selectedLeafDirSet } = selectLeafDirectories({
		parentAbsolutePath: absolutePath,
		parentBytes: bytes,
		leafEntries,
		selectionPolicy: policy.selection,
		directoryMetrics,
	});

	const entries: Array<SizeBreakdownLeafDirectory | SizeBreakdownOthers> = [...selected];
	const others = computeOthersRow({
		parentTotals: totals,
		selectedTotals,
		leafEntries,
		selectedLeafDirSet,
	});
	if (others) entries.push(others);

	return {
		kind: 'parent',
		path: seg,
		absolutePath,
		bytes,
		fileCount,
		maxFileBytes,
		entries,
	};
}

/**
 * Computes the guided size breakdown model used by the metrics webview:
 * a list of top-level segments, each showing a short list of the largest directories,
 * plus an "Others" summary to keep the tree shallow.
 * @param input - Breakdown input built from scan internals.
 * @returns Size breakdown result.
 */
export function computeSizeBreakdown(input: ComputeSizeBreakdownInput): SizeBreakdownResult {
	const { rootPath, directoryMetrics, options } = input;

	const policy = BreakdownPolicy.fromRaw(options);
	const root = CanonicalPath.from(rootPath);
	const totalsBySeg = computeTopLevelTotals(root, directoryMetrics);
	const candidatesBySeg = computeCandidatesByTopLevel(root, directoryMetrics);
	const segments = new Set<string>([...totalsBySeg.keys(), ...candidatesBySeg.keys()]);

	const parents: SizeBreakdownParent[] = [];
	for (const seg of segments) {
		// Root-level direct files are intentionally excluded from the guided breakdown.
		// They still count toward the overall scan total, but we keep the breakdown focused on top-level folders.
		if (seg === SIZE_BREAKDOWN_ROOT_SEGMENT) continue;

		const totals = totalsBySeg.get(seg) ?? DirectoryAggregate.empty();

		// Candidates are direct-bytes directories under this top-level segment.
		const leafEntries = candidatesBySeg.get(seg) ?? [];
		const parent = buildParentForSegment({
			rootPath,
			seg,
			totals,
			leafEntries,
			directoryMetrics,
			policy,
		});
		if (parent) parents.push(parent);
	}

	parents.sort((a, b) => b.bytes - a.bytes);

	// Filter top-level segments using the same policy that governs leaf selection:
	// minItemPercent relative to the total, maxItems cap, always keeping the largest.
	// Parents are already sorted descending, so `i` correctly represents selectedCount.
	const totalParentBytes = parents.reduce((sum, p) => sum + p.bytes, 0);
	const shownParents: SizeBreakdownParent[] = [];
	for (const [i, p] of parents.entries()) {
		if (policy.selection.shouldStopBeforeSelecting({
			selectedCount: i,
			candidateBytes: p.bytes,
			parentBytes: totalParentBytes,
		})) break;
		shownParents.push(p);
	}

	const hiddenCount = parents.length - shownParents.length;
	const hiddenParents = hiddenCount > 0
		? { count: hiddenCount, bytes: parents.slice(shownParents.length).reduce((s, p) => s + p.bytes, 0) }
		: undefined;

	return { rootPath, parents: shownParents, ...(hiddenParents && { hiddenParents }) };
}
