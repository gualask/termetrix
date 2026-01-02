import * as path from 'path';
import type { SizeBreakdownFile, SizeBreakdownLeafDirectory, SizeBreakdownOthers, SizeBreakdownParent, SizeBreakdownResult } from '../../types';
import { isPathWithinRoot } from '../../common/pathUtils';

type TopFile = { absolutePath: string; name: string; bytes: number };
type CandidateDirectory = { absolutePath: string; bytes: number; fileCount: number; maxFileBytes: number };
type TopLevelTotals = { bytes: number; fileCount: number; maxFileBytes: number };

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

function toDisplayPath(relativePath: string): string {
	return relativePath.split(path.sep).join('/');
}

function getTopLevelSegment(rootPath: string, absolutePath: string): string | undefined {
	if (absolutePath === rootPath) return undefined;
	if (!isPathWithinRoot(absolutePath, rootPath)) return undefined;
	const relative = path.relative(rootPath, absolutePath);
	if (!relative || relative.startsWith('..')) return undefined;
	const seg = relative.split(path.sep)[0];
	return seg || undefined;
}

function bumpTotalsBytes(totalsBySeg: Map<string, TopLevelTotals>, seg: string, bytes: number): void {
	const current = totalsBySeg.get(seg) ?? { bytes: 0, fileCount: 0, maxFileBytes: 0 };
	current.bytes += bytes;
	totalsBySeg.set(seg, current);
}

function bumpTotalsFileCount(totalsBySeg: Map<string, TopLevelTotals>, seg: string, fileCount: number): void {
	const current = totalsBySeg.get(seg) ?? { bytes: 0, fileCount: 0, maxFileBytes: 0 };
	current.fileCount += fileCount;
	totalsBySeg.set(seg, current);
}

function bumpTotalsMaxFileBytes(totalsBySeg: Map<string, TopLevelTotals>, seg: string, maxFileBytes: number): void {
	if (maxFileBytes <= 0) return;
	const current = totalsBySeg.get(seg) ?? { bytes: 0, fileCount: 0, maxFileBytes: 0 };
	if (maxFileBytes > current.maxFileBytes) current.maxFileBytes = maxFileBytes;
	totalsBySeg.set(seg, current);
}

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

	const candidates = topFilesByDirectory[leafAbsolutePath] ?? [];
	if (candidates.length === 0) return undefined;

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

export function computeSizeBreakdown(input: ComputeSizeBreakdownInput): SizeBreakdownResult {
	const {
		rootPath,
		directorySizes,
		directoryFileCounts,
		directoryMaxFileBytes,
		topFilesByDirectory,
		options,
	} = input;

	const coverageTarget = options?.coverageTarget ?? 0.8;
	const minItemPercent = options?.minItemPercent ?? 0.03;
	const maxItems = options?.maxItems ?? Math.max(1, Math.floor(1 / minItemPercent));
	const fileCoverageTarget = options?.fileCoverageTarget ?? 0.8;
	const minFilePercent = options?.minFilePercent ?? 0.05;
	const maxFilesPerLeaf = options?.maxFilesPerLeaf ?? Math.max(3, Math.floor(1 / minFilePercent));
	const largeFileThresholdBytes = options?.largeFileThresholdBytes ?? 10 * 1024 * 1024;

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
		const absolutePath = path.join(rootPath, seg);
		const totals = totalsBySeg.get(seg) ?? { bytes: 0, fileCount: 0, maxFileBytes: 0 };
		const bytes = totals.bytes;
		const fileCount = totals.fileCount;
		const maxFileBytes = totals.maxFileBytes;

		if (bytes <= 0 && fileCount <= 0) continue;

		const leafEntries = candidatesBySeg.get(seg) ?? [];
		leafEntries.sort((a, b) => b.bytes - a.bytes);

		const minItemBytes = bytes > 0 ? bytes * minItemPercent : 0;
		const selected: SizeBreakdownLeafDirectory[] = [];
		const selectedLeafDirSet = new Set<string>();

		let selectedBytes = 0;
		let selectedFileCount = 0;

		for (const entry of leafEntries) {
			if (selected.length >= maxItems) break;
			if (selected.length > 0 && entry.bytes < minItemBytes) break;

			const rawRelative = path.relative(absolutePath, entry.absolutePath);
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

			if (bytes > 0 && selectedBytes / bytes >= coverageTarget) break;
		}

		const othersBytes = Math.max(0, bytes - selectedBytes);
		const othersLeafDirs = Math.max(0, leafEntries.length - selected.length);
		const othersFileCount = Math.max(0, fileCount - selectedFileCount);

		let othersMaxFileBytes = 0;
		for (const candidate of leafEntries) {
			if (selectedLeafDirSet.has(candidate.absolutePath)) continue;
			if (candidate.maxFileBytes > othersMaxFileBytes) othersMaxFileBytes = candidate.maxFileBytes;
		}

		const entries: Array<SizeBreakdownLeafDirectory | SizeBreakdownOthers> = [...selected];
		if (othersBytes > 0 || othersLeafDirs > 0 || othersFileCount > 0) {
			entries.push({
				kind: 'others',
				bytes: othersBytes,
				fileCount: othersFileCount,
				maxFileBytes: othersMaxFileBytes,
				leafDirs: othersLeafDirs,
			});
		}

		parents.push({
			kind: 'parent',
			path: seg,
			absolutePath,
			bytes,
			fileCount,
			maxFileBytes,
			entries,
		});
	}

	parents.sort((a, b) => b.bytes - a.bytes);
	return { rootPath, parents };
}
