import * as path from 'path';
import type { SizeBreakdownFile, SizeBreakdownLeafDirectory, SizeBreakdownOthers, SizeBreakdownParent, SizeBreakdownResult } from '../../types';
import { isPathWithinRoot } from '../../common/pathUtils';

type TopFile = { absolutePath: string; name: string; bytes: number };
type CandidateDirectory = { absolutePath: string; bytes: number; fileCount: number; maxFileBytes: number };
type TopLevelTotals = { bytes: number; fileCount: number; maxFileBytes: number };

type ResolvedSizeBreakdownOptions = {
	coverageTarget: number;
	minItemPercent: number;
	maxItems: number;
	fileCoverageTarget: number;
	minFilePercent: number;
	maxFilesPerLeaf: number;
	largeFileThresholdBytes: number;
};

export interface ComputeSizeBreakdownOptions {
	coverageTarget?: number;
	minItemPercent?: number;
	maxItems?: number;
	fileCoverageTarget?: number;
	minFilePercent?: number;
	maxFilesPerLeaf?: number;
	largeFileThresholdBytes?: number;
}

export interface ComputeSizeBreakdownInput {
	rootPath: string;
	directorySizes: Record<string, number>;
	directoryFileCounts?: Record<string, number>;
	directoryMaxFileBytes?: Record<string, number>;
	topFilesByDirectory?: Record<string, TopFile[]>;
	options?: ComputeSizeBreakdownOptions;
}

/**
 * Converts a relative path to a display-friendly path using POSIX separators.
 */
function toDisplayPath(relativePath: string): string {
	return relativePath.split(path.sep).join('/');
}

/**
 * Returns the first path segment under `rootPath` for an absolute path (or `undefined` if invalid).
 * Used to group directory metrics by top-level folder in the UI.
 */
function getTopLevelSegment(rootPath: string, absolutePath: string): string | undefined {
	if (absolutePath === rootPath) return undefined;
	if (!isPathWithinRoot(absolutePath, rootPath)) return undefined;
	const relative = path.relative(rootPath, absolutePath);
	if (!relative || relative.startsWith('..')) return undefined;
	const seg = relative.split(path.sep)[0];
	return seg || undefined;
}

/**
 * Adds bytes to the top-level segment accumulator.
 */
function bumpTotalsBytes(totalsBySeg: Map<string, TopLevelTotals>, seg: string, bytes: number): void {
	const current = totalsBySeg.get(seg) ?? { bytes: 0, fileCount: 0, maxFileBytes: 0 };
	current.bytes += bytes;
	totalsBySeg.set(seg, current);
}

/**
 * Adds file counts to the top-level segment accumulator.
 */
function bumpTotalsFileCount(totalsBySeg: Map<string, TopLevelTotals>, seg: string, fileCount: number): void {
	const current = totalsBySeg.get(seg) ?? { bytes: 0, fileCount: 0, maxFileBytes: 0 };
	current.fileCount += fileCount;
	totalsBySeg.set(seg, current);
}

/**
 * Updates the top-level segment max-file-bytes accumulator.
 */
function bumpTotalsMaxFileBytes(totalsBySeg: Map<string, TopLevelTotals>, seg: string, maxFileBytes: number): void {
	if (maxFileBytes <= 0) return;
	const current = totalsBySeg.get(seg) ?? { bytes: 0, fileCount: 0, maxFileBytes: 0 };
	if (maxFileBytes > current.maxFileBytes) current.maxFileBytes = maxFileBytes;
	totalsBySeg.set(seg, current);
}

/**
 * Aggregates totals for each top-level segment under `rootPath`.
 * Totals are computed from per-directory "direct" values collected during scanning.
 */
function computeTopLevelTotals(params: {
	rootPath: string;
	directorySizes: Record<string, number>;
	directoryFileCounts: Record<string, number>;
	directoryMaxFileBytes: Record<string, number>;
}): Map<string, TopLevelTotals> {
	const { rootPath, directorySizes, directoryFileCounts, directoryMaxFileBytes } = params;
	const totalsBySeg = new Map<string, TopLevelTotals>();

	for (const [dirPath, bytes] of Object.entries(directorySizes)) {
		if (bytes <= 0) continue;
		const seg = getTopLevelSegment(rootPath, dirPath);
		if (!seg) continue;
		bumpTotalsBytes(totalsBySeg, seg, bytes);
	}

	for (const [dirPath, fileCount] of Object.entries(directoryFileCounts)) {
		if (fileCount <= 0) continue;
		const seg = getTopLevelSegment(rootPath, dirPath);
		if (!seg) continue;
		bumpTotalsFileCount(totalsBySeg, seg, fileCount);
	}

	for (const [dirPath, maxFileBytes] of Object.entries(directoryMaxFileBytes)) {
		if (maxFileBytes <= 0) continue;
		const seg = getTopLevelSegment(rootPath, dirPath);
		if (!seg) continue;
		bumpTotalsMaxFileBytes(totalsBySeg, seg, maxFileBytes);
	}

	return totalsBySeg;
}

/**
 * Builds a flat list of candidate directories for each top-level segment.
 * Candidates represent directories with non-zero direct bytes (not recursive totals).
 */
function computeCandidatesByTopLevel(params: {
	rootPath: string;
	directorySizes: Record<string, number>;
	directoryFileCounts: Record<string, number>;
	directoryMaxFileBytes: Record<string, number>;
}): Map<string, CandidateDirectory[]> {
	const { rootPath, directorySizes, directoryFileCounts, directoryMaxFileBytes } = params;
	const candidatesBySeg = new Map<string, CandidateDirectory[]>();

	for (const [dirPath, bytes] of Object.entries(directorySizes)) {
		if (bytes <= 0) continue;
		const seg = getTopLevelSegment(rootPath, dirPath);
		if (!seg) continue;
		const list = candidatesBySeg.get(seg);
		const candidate: CandidateDirectory = {
			absolutePath: dirPath,
			bytes,
			fileCount: directoryFileCounts[dirPath] ?? 0,
			maxFileBytes: directoryMaxFileBytes[dirPath] ?? 0,
		};
		if (list) list.push(candidate);
		else candidatesBySeg.set(seg, [candidate]);
	}

	return candidatesBySeg;
}

/**
 * Selects a small list of "largest files" to show under a leaf directory entry.
 * Returns `undefined` when we don't have top-file data or the leaf doesn't contain large files.
 */
function computeLeafFiles(params: {
	leafAbsolutePath: string;
	leafBytes: number;
	leafMaxFileBytes: number;
	topFilesByDirectory?: Record<string, TopFile[]>;
	fileCoverageTarget: number;
	minFilePercent: number;
	maxFilesPerLeaf: number;
	largeFileThresholdBytes: number;
}): SizeBreakdownFile[] | undefined {
	const {
		leafAbsolutePath,
		leafBytes,
		leafMaxFileBytes,
		topFilesByDirectory,
		fileCoverageTarget,
		minFilePercent,
		maxFilesPerLeaf,
		largeFileThresholdBytes,
	} = params;

	if (!topFilesByDirectory) return undefined;
	if (leafMaxFileBytes < largeFileThresholdBytes) return undefined;

	const rawCandidates = topFilesByDirectory[leafAbsolutePath] ?? [];
	if (rawCandidates.length === 0) return undefined;

	// `topFilesByDirectory` is expected to be already sorted desc by bytes. Keep this best-effort robust:
	// if it's not sorted, sort a copy so the early breaks below don't hide large files.
	let candidates = rawCandidates;
	for (let i = 1; i < rawCandidates.length; i++) {
		if (rawCandidates[i].bytes > rawCandidates[i - 1].bytes) {
			candidates = [...rawCandidates].sort((a, b) => b.bytes - a.bytes);
			break;
		}
	}

	const minFileBytes = leafBytes > 0 ? leafBytes * minFilePercent : 0;
	let coveredBytes = 0;
	const files: SizeBreakdownFile[] = [];

	for (const f of candidates) {
		if (files.length >= maxFilesPerLeaf) break;
		if (files.length > 0 && f.bytes < minFileBytes) break;
		files.push({ name: f.name, absolutePath: f.absolutePath, bytes: f.bytes });
		coveredBytes += f.bytes;
		if (leafBytes > 0 && coveredBytes / leafBytes >= fileCoverageTarget) break;
	}

	return files.length > 0 ? files : undefined;
}

/**
 * Resolves defaults for size breakdown thresholds derived from percentages.
 */
function resolveSizeBreakdownOptions(options: ComputeSizeBreakdownOptions | undefined): ResolvedSizeBreakdownOptions {
	const coverageTarget = options?.coverageTarget ?? 0.8;
	const minItemPercent = options?.minItemPercent ?? 0.03;
	const maxItems = options?.maxItems ?? Math.max(1, Math.floor(1 / minItemPercent));

	const fileCoverageTarget = options?.fileCoverageTarget ?? 0.8;
	const minFilePercent = options?.minFilePercent ?? 0.05;
	const maxFilesPerLeaf = options?.maxFilesPerLeaf ?? Math.max(3, Math.floor(1 / minFilePercent));

	const largeFileThresholdBytes = options?.largeFileThresholdBytes ?? 10 * 1024 * 1024;

	return {
		coverageTarget,
		minItemPercent,
		maxItems,
		fileCoverageTarget,
		minFilePercent,
		maxFilesPerLeaf,
		largeFileThresholdBytes,
	};
}

/**
 * Selects the most relevant leaf directories for a parent segment based on:
 * - descending bytes order
 * - a minimum per-item threshold (relative to the parent)
 * - a coverage target (stop once enough bytes are covered)
 */
function selectLeafDirectories(params: {
	parentAbsolutePath: string;
	parentBytes: number;
	leafEntries: CandidateDirectory[];
	coverageTarget: number;
	minItemPercent: number;
	maxItems: number;
	topFilesByDirectory?: Record<string, TopFile[]>;
	fileCoverageTarget: number;
	minFilePercent: number;
	maxFilesPerLeaf: number;
	largeFileThresholdBytes: number;
}): {
	selected: SizeBreakdownLeafDirectory[];
	selectedBytes: number;
	selectedFileCount: number;
	selectedLeafDirSet: Set<string>;
} {
	const {
		parentAbsolutePath,
		parentBytes,
		leafEntries,
		coverageTarget,
		minItemPercent,
		maxItems,
		topFilesByDirectory,
		fileCoverageTarget,
		minFilePercent,
		maxFilesPerLeaf,
		largeFileThresholdBytes,
	} = params;

	// Biggest first, so selection converges quickly.
	leafEntries.sort((a, b) => b.bytes - a.bytes);

	// Per-parent thresholds (relative to the segment totals).
	const minItemBytes = parentBytes > 0 ? parentBytes * minItemPercent : 0;
	const selected: SizeBreakdownLeafDirectory[] = [];
	const selectedLeafDirSet = new Set<string>();

	let selectedBytes = 0;
	let selectedFileCount = 0;

	for (const entry of leafEntries) {
		// Stop when we have enough items or remaining items are too small.
		if (selected.length >= maxItems) break;
		if (selected.length > 0 && entry.bytes < minItemBytes) break;

		const rawRelative = path.relative(parentAbsolutePath, entry.absolutePath);
		const displayRelative = rawRelative ? toDisplayPath(rawRelative) : '.';
		const leafDir: SizeBreakdownLeafDirectory = {
			kind: 'leafDirectory',
			path: displayRelative,
			absolutePath: entry.absolutePath,
			bytes: entry.bytes,
			fileCount: entry.fileCount,
			maxFileBytes: entry.maxFileBytes,
		};

		const files = computeLeafFiles({
			leafAbsolutePath: entry.absolutePath,
			leafBytes: entry.bytes,
			leafMaxFileBytes: entry.maxFileBytes,
			topFilesByDirectory,
			fileCoverageTarget,
			minFilePercent,
			maxFilesPerLeaf,
			largeFileThresholdBytes,
		});
		if (files) leafDir.files = files;

		selected.push(leafDir);
		selectedLeafDirSet.add(entry.absolutePath);

		selectedBytes += entry.bytes;
		selectedFileCount += entry.fileCount;

		// Stop once we've covered enough of the parent's bytes.
		if (parentBytes > 0 && selectedBytes / parentBytes >= coverageTarget) break;
	}

	return { selected, selectedBytes, selectedFileCount, selectedLeafDirSet };
}

/**
 * Builds the "Others" row for a parent segment, summarizing what was not selected.
 */
function computeOthersRow(params: {
	parentBytes: number;
	parentFileCount: number;
	selectedBytes: number;
	selectedFileCount: number;
	leafEntries: CandidateDirectory[];
	selectedLeafDirSet: Set<string>;
}): SizeBreakdownOthers | undefined {
	const { parentBytes, parentFileCount, selectedBytes, selectedFileCount, leafEntries, selectedLeafDirSet } = params;

	// "Others" is relative to this top-level segment (not the full project).
	const othersBytes = Math.max(0, parentBytes - selectedBytes);
	const othersLeafDirs = Math.max(0, leafEntries.length - selectedLeafDirSet.size);
	const othersFileCount = Math.max(0, parentFileCount - selectedFileCount);

	if (othersBytes <= 0 && othersLeafDirs <= 0 && othersFileCount <= 0) return undefined;

	let othersMaxFileBytes = 0;
	// Compute max file bytes among non-selected candidates to reduce "what's inside?" doubt.
	for (const candidate of leafEntries) {
		if (selectedLeafDirSet.has(candidate.absolutePath)) continue;
		if (candidate.maxFileBytes > othersMaxFileBytes) othersMaxFileBytes = candidate.maxFileBytes;
	}

	return {
		kind: 'others',
		bytes: othersBytes,
		fileCount: othersFileCount,
		maxFileBytes: othersMaxFileBytes,
		leafDirs: othersLeafDirs,
	};
}

/**
 * Constructs a parent segment entry and its children (selected leaf dirs + optional others row).
 * Returns `undefined` when the segment has no meaningful data.
 */
function buildParentForSegment(params: {
	rootPath: string;
	seg: string;
	totals: TopLevelTotals;
	leafEntries: CandidateDirectory[];
	topFilesByDirectory?: Record<string, TopFile[]>;
	options: ResolvedSizeBreakdownOptions;
}): SizeBreakdownParent | undefined {
	const { rootPath, seg, totals, leafEntries, topFilesByDirectory, options } = params;

	const bytes = totals.bytes;
	const fileCount = totals.fileCount;
	const maxFileBytes = totals.maxFileBytes;
	if (bytes <= 0 && fileCount <= 0) return undefined;

	const absolutePath = path.join(rootPath, seg);
	const { selected, selectedBytes, selectedFileCount, selectedLeafDirSet } = selectLeafDirectories({
		parentAbsolutePath: absolutePath,
		parentBytes: bytes,
		leafEntries,
		coverageTarget: options.coverageTarget,
		minItemPercent: options.minItemPercent,
		maxItems: options.maxItems,
		topFilesByDirectory,
		fileCoverageTarget: options.fileCoverageTarget,
		minFilePercent: options.minFilePercent,
		maxFilesPerLeaf: options.maxFilesPerLeaf,
		largeFileThresholdBytes: options.largeFileThresholdBytes,
	});

	const entries: Array<SizeBreakdownLeafDirectory | SizeBreakdownOthers> = [...selected];
	const others = computeOthersRow({
		parentBytes: bytes,
		parentFileCount: fileCount,
		selectedBytes,
		selectedFileCount,
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
 * a list of top-level segments, each showing a short list of the largest directories and files,
 * plus an "Others" summary to keep the tree shallow.
 */
export function computeSizeBreakdown(input: ComputeSizeBreakdownInput): SizeBreakdownResult {
	const {
		rootPath,
		directorySizes,
		directoryFileCounts,
		directoryMaxFileBytes,
		topFilesByDirectory,
		options,
	} = input;

	const resolvedOptions = resolveSizeBreakdownOptions(options);

	const directoryFileCountsValue = directoryFileCounts ?? {};
	const directoryMaxFileBytesValue = directoryMaxFileBytes ?? {};

	const totalsBySeg = computeTopLevelTotals({
		rootPath,
		directorySizes,
		directoryFileCounts: directoryFileCountsValue,
		directoryMaxFileBytes: directoryMaxFileBytesValue,
	});
	const candidatesBySeg = computeCandidatesByTopLevel({
		rootPath,
		directorySizes,
		directoryFileCounts: directoryFileCountsValue,
		directoryMaxFileBytes: directoryMaxFileBytesValue,
	});
	const segments = new Set<string>([...totalsBySeg.keys(), ...candidatesBySeg.keys()]);

	const parents: SizeBreakdownParent[] = [];
	for (const seg of segments) {
		const totals = totalsBySeg.get(seg) ?? { bytes: 0, fileCount: 0, maxFileBytes: 0 };

		// Candidates are direct-bytes directories under this top-level segment.
		const leafEntries = candidatesBySeg.get(seg) ?? [];
		const parent = buildParentForSegment({
			rootPath,
			seg,
			totals,
			leafEntries,
			topFilesByDirectory,
			options: resolvedOptions,
		});
		if (parent) parents.push(parent);
	}

	parents.sort((a, b) => b.bytes - a.bytes);
	return { rootPath, parents };
}
