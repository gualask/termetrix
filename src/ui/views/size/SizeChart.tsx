import { useMemo } from 'preact/hooks';
import type { DirectoryInfo } from '../../types';
import { formatBytes } from '../../utils';
import { EmptyState } from '../../components/EmptyState';
import { RowButton } from '../../components/RowButton';

interface Props {
	directories: DirectoryInfo[] | null;
	totalBytes: number;
	onReveal: (path: string) => void;
	isLoading?: boolean;
}

interface DisplayItem {
	dir: DirectoryInfo;
	name: string;
	bytes: number;
	percent: number;
	children?: DisplayItem[];
}

function formatPercent(percent: number): string {
	if (!Number.isFinite(percent) || percent <= 0) return '0%';
	if (percent < 0.1) return '<0.1%';
	return `${percent.toFixed(1)}%`;
}

/**
 * Find direct children of a path
 */
function getDirectChildren(parentPath: string, allDirs: DirectoryInfo[]): DirectoryInfo[] {
	const prefix = parentPath ? parentPath + '/' : '';
	return allDirs.filter(d => {
		if (!d.path.startsWith(prefix)) return false;
		const rest = d.path.slice(prefix.length);
		return rest.length > 0 && !rest.includes('/');
	});
}

/**
 * Check if a directory has dominant children (concentrated size distribution)
 */
function getDominantChildren(
	dir: DirectoryInfo,
	allDirs: DirectoryInfo[],
	threshold: number = 0.25
): DirectoryInfo[] {
	const children = getDirectChildren(dir.path, allDirs);
	if (children.length === 0) return [];

	const dominant = children.filter(c => c.bytes / dir.bytes >= threshold);
	if (dominant.length === 0 || dominant.length > 5) return [];

	const dominantTotal = dominant.reduce((sum, c) => sum + c.bytes, 0);
	if (dominantTotal / dir.bytes < 0.6) return [];
	return dominant;
}

/**
 * Recursively find the deepest interesting directories
 */
function findDeepInteresting(
	dir: DirectoryInfo,
	allDirs: DirectoryInfo[]
): DirectoryInfo[] {
	const dominant = getDominantChildren(dir, allDirs);

	if (dominant.length === 0) {
		return [dir];
	}

	const results: DirectoryInfo[] = [];
	for (const child of dominant) {
		results.push(...findDeepInteresting(child, allDirs));
	}
	return results;
}

/**
 * Build display items with 2-level hierarchy for deep mode
 */
function computeDeepDisplayItems(
	directories: DirectoryInfo[],
	totalBytes: number
): DisplayItem[] {
	if (directories.length === 0 || totalBytes === 0) return [];

	const topLevel = getDirectChildren('', directories);
	const sorted = [...topLevel].sort((a, b) => b.bytes - a.bytes);

	return sorted.map(dir => {
		const interesting = findDeepInteresting(dir, directories);

		const children = interesting
			.filter(d => d.path !== dir.path)
			.sort((a, b) => b.bytes - a.bytes);

		const item: DisplayItem = {
			dir,
			name: dir.path,
			bytes: dir.bytes,
			percent: (dir.bytes / totalBytes) * 100
		};

		if (children.length > 0) {
			item.children = children.map(child => ({
				dir: child,
				name: child.path.slice(dir.path.length + 1),
				bytes: child.bytes,
				percent: (child.bytes / totalBytes) * 100
			}));
		}

		return item;
	});
}

export function SizeChart({ directories, totalBytes, onReveal, isLoading }: Props) {
	// Memoize expensive directory tree computation
	const items = useMemo(() => {
		if (!directories || totalBytes === 0) return [];
		return computeDeepDisplayItems(directories, totalBytes);
	}, [directories, totalBytes]);

	const maxPercent = useMemo(() => {
		if (items.length === 0) return 0;
		return Math.max(...items.map(i => i.percent));
	}, [items]);

	const empty = (
		<div class="size-chart empty">
			{!isLoading && <EmptyState variant="inline" message="No data available." />}
		</div>
	);

	if (!directories || items.length === 0) return empty;

	return (
		<div class="size-chart">
			{items.map((item) => (
				<div key={item.dir.absolutePath} class="size-chart-group">
					<RowButton
						class="size-chart-row parent"
						onClick={() => onReveal(item.dir.absolutePath)}
					>
						<div
							class="size-chart-bar"
							style={{ width: `${(item.percent / maxPercent) * 100}%` }}
						/>
						<span class="size-chart-name">{item.name}</span>
						<div class="size-chart-value">
							{formatBytes(item.bytes)}
							<span class="size-chart-percent">{formatPercent(item.percent)}</span>
						</div>
					</RowButton>
					{item.children?.map((child) => (
						<RowButton
							key={child.dir.absolutePath}
							class="size-chart-row child"
							onClick={() => onReveal(child.dir.absolutePath)}
						>
							<span class="size-chart-name">{child.name}</span>
							<div class="size-chart-value">
								{formatBytes(child.bytes)}
							</div>
						</RowButton>
					))}
				</div>
			))}
		</div>
	);
}
