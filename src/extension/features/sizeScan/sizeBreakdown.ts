import * as path from 'path';
import type { SizeBreakdownFile, SizeBreakdownLeafDirectory, SizeBreakdownOthers, SizeBreakdownParent, SizeBreakdownResult } from '../../types';
import { isPathWithinRoot } from '../../common/pathUtils';

type TopFile = { absolutePath: string; name: string; bytes: number };

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

function bumpSum(map: Map<string, number>, key: string, delta: number): void {
	map.set(key, (map.get(key) ?? 0) + delta);
}

function bumpMax(map: Map<string, number>, key: string, candidate: number): void {
	if (candidate <= 0) return;
	const current = map.get(key) ?? 0;
	if (candidate > current) map.set(key, candidate);
}

function walkAncestorsWithinRoot(startPath: string, rootPath: string, cb: (ancestor: string) => void): void {
	let currentPath = startPath;
	while (true) {
		const parentPath = path.dirname(currentPath);
		if (
			parentPath === currentPath ||
			!isPathWithinRoot(parentPath, rootPath) ||
			parentPath.length < rootPath.length
		) {
			break;
		}
		cb(parentPath);
		currentPath = parentPath;
	}
}

function computeCumulativeBytes(rootPath: string, directorySizes: Record<string, number>): Map<string, number> {
	const cumulativeBytes = new Map<string, number>();

	for (const [dirPath, directBytes] of Object.entries(directorySizes)) {
		if (directBytes <= 0) continue;
		if (!isPathWithinRoot(dirPath, rootPath)) continue;

		bumpSum(cumulativeBytes, dirPath, directBytes);
		walkAncestorsWithinRoot(dirPath, rootPath, (ancestor) => bumpSum(cumulativeBytes, ancestor, directBytes));
	}

	return cumulativeBytes;
}

function computeCumulativeFileCounts(rootPath: string, directoryFileCounts: Record<string, number>): Map<string, number> {
	const cumulativeFileCounts = new Map<string, number>();

	for (const [dirPath, directCount] of Object.entries(directoryFileCounts)) {
		if (directCount <= 0) continue;
		if (!isPathWithinRoot(dirPath, rootPath)) continue;

		bumpSum(cumulativeFileCounts, dirPath, directCount);
		walkAncestorsWithinRoot(dirPath, rootPath, (ancestor) => bumpSum(cumulativeFileCounts, ancestor, directCount));
	}

	return cumulativeFileCounts;
}

function computeCumulativeMaxFileBytes(rootPath: string, directoryMaxFileBytes: Record<string, number>): Map<string, number> {
	const cumulativeMaxFileBytes = new Map<string, number>();

	for (const [dirPath, directMax] of Object.entries(directoryMaxFileBytes)) {
		if (directMax <= 0) continue;
		if (!isPathWithinRoot(dirPath, rootPath)) continue;

		bumpMax(cumulativeMaxFileBytes, dirPath, directMax);
		walkAncestorsWithinRoot(dirPath, rootPath, (ancestor) => bumpMax(cumulativeMaxFileBytes, ancestor, directMax));
	}

	return cumulativeMaxFileBytes;
}

function computeFileLeafDirectories(rootPath: string, directoryFileCounts: Record<string, number>): string[] {
	const dirsWithDirectFiles = Object.entries(directoryFileCounts)
		.filter(([, count]) => count > 0)
		.map(([dirPath]) => dirPath)
		.filter((dirPath) => dirPath !== rootPath && isPathWithinRoot(dirPath, rootPath));

	const directFilesSet = new Set(dirsWithDirectFiles);
	const hasChildWithFiles = new Set<string>();

	for (const dirPath of dirsWithDirectFiles) {
		let currentPath = dirPath;
		while (true) {
			const parentPath = path.dirname(currentPath);
			if (
				parentPath === currentPath ||
				!isPathWithinRoot(parentPath, rootPath) ||
				parentPath.length < rootPath.length
			) {
				break;
			}
			if (directFilesSet.has(parentPath)) hasChildWithFiles.add(parentPath);
			currentPath = parentPath;
		}
	}

	return dirsWithDirectFiles.filter((dirPath) => !hasChildWithFiles.has(dirPath));
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

	const cumulativeBytes = computeCumulativeBytes(rootPath, directorySizes);
	const cumulativeFileCounts = computeCumulativeFileCounts(rootPath, directoryFileCounts ?? {});
	const cumulativeMaxFileBytes = computeCumulativeMaxFileBytes(rootPath, directoryMaxFileBytes ?? {});

	const topLevelSegments = new Set<string>();
	for (const dirPath of cumulativeBytes.keys()) {
		if (dirPath === rootPath) continue;
		const relative = path.relative(rootPath, dirPath);
		if (!relative || relative.startsWith('..')) continue;
		topLevelSegments.add(relative.split(path.sep)[0]);
	}

	const fileLeafDirs = computeFileLeafDirectories(rootPath, directoryFileCounts ?? {});
	const leafDirsByTopLevel = new Map<string, string[]>();
	for (const leafDirPath of fileLeafDirs) {
		const relative = path.relative(rootPath, leafDirPath);
		if (!relative || relative.startsWith('..')) continue;
		const seg = relative.split(path.sep)[0];
		const list = leafDirsByTopLevel.get(seg);
		if (list) list.push(leafDirPath);
		else leafDirsByTopLevel.set(seg, [leafDirPath]);
	}

	const maxDirsByTopLevel = new Map<string, Array<{ dirPath: string; maxFileBytes: number }>>();
	for (const [dirPath, maxFileBytesValue] of Object.entries(directoryMaxFileBytes ?? {})) {
		if (maxFileBytesValue <= 0) continue;
		const relative = path.relative(rootPath, dirPath);
		if (!relative || relative.startsWith('..')) continue;
		const seg = relative.split(path.sep)[0];
		const list = maxDirsByTopLevel.get(seg);
		const entry = { dirPath, maxFileBytes: maxFileBytesValue };
		if (list) list.push(entry);
		else maxDirsByTopLevel.set(seg, [entry]);
	}

	const parents: SizeBreakdownParent[] = [];
	for (const seg of topLevelSegments) {
		const absolutePath = path.join(rootPath, seg);
		const bytes = cumulativeBytes.get(absolutePath) ?? 0;
		const fileCount = cumulativeFileCounts.get(absolutePath) ?? 0;
		const maxFileBytes = cumulativeMaxFileBytes.get(absolutePath) ?? 0;

		if (bytes <= 0 && fileCount <= 0) continue;

		const leafDirs = leafDirsByTopLevel.get(seg) ?? [];
		const leafEntries: Array<{ absolutePath: string; bytes: number; fileCount: number; maxFileBytes: number }> = [];
		for (const leafDirPath of leafDirs) {
			leafEntries.push({
				absolutePath: leafDirPath,
				bytes: cumulativeBytes.get(leafDirPath) ?? 0,
				fileCount: cumulativeFileCounts.get(leafDirPath) ?? 0,
				maxFileBytes: cumulativeMaxFileBytes.get(leafDirPath) ?? 0,
			});
		}
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

			if (entry.maxFileBytes >= largeFileThresholdBytes) {
				const candidates = topFilesByDirectory?.[entry.absolutePath] ?? [];
				const minFileBytes = entry.bytes > 0 ? entry.bytes * minFilePercent : 0;
				let coveredBytes = 0;
				const files: SizeBreakdownFile[] = [];

				for (const f of candidates) {
					if (files.length >= maxFilesPerLeaf) break;
					if (files.length > 0 && f.bytes < minFileBytes) break;
					files.push({ name: f.name, absolutePath: f.absolutePath, bytes: f.bytes });
					coveredBytes += f.bytes;
					if (entry.bytes > 0 && coveredBytes / entry.bytes >= fileCoverageTarget) break;
				}
				if (files.length > 0) leafDir.files = files;
			}

			selected.push(leafDir);
			selectedLeafDirSet.add(entry.absolutePath);

			selectedBytes += entry.bytes;
			selectedFileCount += entry.fileCount;

			if (bytes > 0 && selectedBytes / bytes >= coverageTarget) break;
		}

		const othersBytes = Math.max(0, bytes - selectedBytes);
		const othersLeafDirs = Math.max(0, leafDirs.length - selected.length);
		const othersFileCount = Math.max(0, fileCount - selectedFileCount);

		let othersMaxFileBytes = 0;
		for (const candidate of maxDirsByTopLevel.get(seg) ?? []) {
			if (selectedLeafDirSet.has(candidate.dirPath)) continue;
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
