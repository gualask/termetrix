import { Ellipsis, Folder } from 'lucide-preact';
import { EmptyState } from '../../components/EmptyState';
import type {
	SizeBreakdownLeafDirectory,
	SizeBreakdownOthers,
	SizeBreakdownParent,
	SizeBreakdownResult,
} from '../../types';
import { formatBytes } from '../../utils';
import { SizeGroupHeader } from './SizeGroupHeader';
import { SizeTableRow } from './SizeTableRow';
import { formatBreakdownParentPath } from './sizeFormatters';

interface Props {
	breakdown: SizeBreakdownResult;
	totalBytes: number;
	onReveal: (path: string) => void;
	isLoading?: boolean;
}

function isOthers(entry: SizeBreakdownLeafDirectory | SizeBreakdownOthers): entry is SizeBreakdownOthers {
	return entry.kind === 'others';
}

// --- Sub-components ---

function buildLeafSubtitle(leaf: SizeBreakdownLeafDirectory): string {
	const parts: string[] = [`${leaf.fileCount.toLocaleString()} files`];
	if (leaf.fileCount > 0) {
		parts.push(`avg ${formatBytes(Math.round(leaf.bytes / leaf.fileCount))}`);
	}
	if (leaf.maxFileName) {
		parts.push(`${leaf.maxFileName} ${formatBytes(leaf.maxFileBytes)}`);
	}
	return parts.join(' · ');
}

function OthersRow({ others, parentBytes }: { others: SizeBreakdownOthers; parentBytes: number }) {
	return (
		<div class="size-table-footer">
			<SizeTableRow
				kind="others"
				icon={<Ellipsis size={16} />}
				name={`others (leaf dirs: ${others.leafDirs.toLocaleString()})`}
				size={others.bytes}
				fileCount={others.fileCount}
				maxFileBytes={others.maxFileBytes}
				share={parentBytes > 0 ? others.bytes / parentBytes : 0}
				title="Aggregated remainder"
				interactive={false}
			/>
		</div>
	);
}

function ParentCard({
	parent,
	shareOfTotal,
	onReveal,
}: {
	parent: SizeBreakdownParent;
	shareOfTotal: number;
	onReveal: (path: string) => void;
}) {
	const parentDisplayPath = formatBreakdownParentPath(parent.path);
	const leafEntries = parent.entries.filter((e): e is SizeBreakdownLeafDirectory => !isOthers(e));
	const others = parent.entries.find(isOthers) as SizeBreakdownOthers | undefined;
	const showOthers = Boolean(others && others.bytes > 0 && others.leafDirs > 0);
	const showBody = leafEntries.length > 0 || showOthers;

	return (
		<div class="size-table-card">
			<SizeGroupHeader
				icon={<Folder size={16} />}
				name={parentDisplayPath}
				size={parent.bytes}
				fileCount={parent.fileCount}
				maxFileBytes={parent.maxFileBytes}
				shareOfTotal={shareOfTotal}
				onClick={() => onReveal(parent.absolutePath)}
			/>
			{showBody && (
				<div class="size-table-body" role="group" aria-label={`${parentDisplayPath} breakdown`}>
					{leafEntries.map((leaf) => (
						<SizeTableRow
							key={leaf.absolutePath}
							kind="leaf"
							icon={<Folder size={16} />}
							name={leaf.path}
							subtitle={buildLeafSubtitle(leaf)}
							size={leaf.bytes}
							share={parent.bytes > 0 ? leaf.bytes / parent.bytes : 0}
							onClick={() => onReveal(leaf.absolutePath)}
						/>
					))}
					{showOthers && others && <OthersRow others={others} parentBytes={parent.bytes} />}
				</div>
			)}
		</div>
	);
}

// --- Main component ---

export function SizeChart({ breakdown, totalBytes, onReveal, isLoading }: Props) {
	const parents = breakdown.parents;
	const computedTotalBytes = totalBytes > 0 ? totalBytes : parents.reduce((sum, p) => sum + p.bytes, 0);

	if (parents.length === 0) {
		return (
			<div class="size-chart empty">{!isLoading && <EmptyState variant="inline" message="No data available." />}</div>
		);
	}

	return (
		<div class="size-chart">
			{parents.map((parent) => (
				<ParentCard
					key={parent.absolutePath}
					parent={parent}
					shareOfTotal={computedTotalBytes > 0 ? parent.bytes / computedTotalBytes : 0}
					onReveal={onReveal}
				/>
			))}
			{breakdown.hiddenParents && (
				<div class="size-chart-hidden-note">
					+{breakdown.hiddenParents.count} small {breakdown.hiddenParents.count === 1 ? 'directory' : 'directories'} not
					shown · {formatBytes(breakdown.hiddenParents.bytes)} total
				</div>
			)}
		</div>
	);
}
