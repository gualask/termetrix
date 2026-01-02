import { useMemo } from 'preact/hooks';
import { File as FileIcon, Folder, MoreHorizontal } from 'lucide-preact';
import type { SizeBreakdownLeafDirectory, SizeBreakdownOthers, SizeBreakdownResult } from '../../types';
import { formatBytes } from '../../utils';
import { EmptyState } from '../../components/EmptyState';
import { RowButton } from '../../components/RowButton';

interface Props {
	breakdown: SizeBreakdownResult;
	onReveal: (path: string) => void;
	isLoading?: boolean;
}

function formatFileStats(bytes: number, fileCount: number, maxFileBytes: number): string {
	const avg = fileCount > 0 ? bytes / fileCount : 0;
	const maxText = maxFileBytes > 0 ? formatBytes(maxFileBytes) : '—';
	return `files: ${fileCount.toLocaleString()} · avg: ${formatBytes(avg)} · max: ${maxText}`;
}

function isOthers(entry: SizeBreakdownLeafDirectory | SizeBreakdownOthers): entry is SizeBreakdownOthers {
	return entry.kind === 'others';
}

export function SizeChart({ breakdown, onReveal, isLoading }: Props) {
	const parents = breakdown.parents;

	const maxParentBytes = useMemo(() => {
		if (parents.length === 0) return 0;
		return Math.max(...parents.map((p) => p.bytes));
	}, [parents]);

	if (parents.length === 0) {
		return (
			<div class="size-chart empty">
				{!isLoading && <EmptyState variant="inline" message="No data available." />}
			</div>
		);
	}

	return (
		<div class="size-chart">
			{parents.map((parent) => (
				<div key={parent.absolutePath} class="size-chart-group">
					<RowButton class="size-chart-row parent" onClick={() => onReveal(parent.absolutePath)}>
						<div
							class="size-chart-bar"
							style={{ width: `${maxParentBytes > 0 ? (parent.bytes / maxParentBytes) * 100 : 0}%` }}
						/>
						<span class="size-chart-icon" aria-hidden="true">
							<Folder size={16} />
						</span>
						<span class="size-chart-name">{parent.path}</span>
						<div class="size-chart-value">
							<div class="size-chart-bytes">{formatBytes(parent.bytes)}</div>
							<div class="size-chart-meta">{formatFileStats(parent.bytes, parent.fileCount, parent.maxFileBytes)}</div>
						</div>
					</RowButton>

					{parent.entries.map((entry) => {
						if (isOthers(entry)) {
							const label = `others (leaf dirs: ${entry.leafDirs.toLocaleString()})`;
							return (
								<RowButton
									key={`${parent.absolutePath}::others`}
									class="size-chart-row child"
									disabled
									title="Aggregated remainder"
								>
									<span class="size-chart-icon" aria-hidden="true">
										<MoreHorizontal size={16} />
									</span>
									<span class="size-chart-name">{label}</span>
									<div class="size-chart-value">
										<div class="size-chart-bytes">{formatBytes(entry.bytes)}</div>
										<div class="size-chart-meta">{formatFileStats(entry.bytes, entry.fileCount, entry.maxFileBytes)}</div>
									</div>
								</RowButton>
							);
						}

						const leaf = entry as SizeBreakdownLeafDirectory;
						const leafWidth = parent.bytes > 0 ? (leaf.bytes / parent.bytes) * 100 : 0;

						return (
							<div key={leaf.absolutePath}>
								<RowButton class="size-chart-row child" onClick={() => onReveal(leaf.absolutePath)}>
									<div class="size-chart-bar" style={{ width: `${leafWidth}%` }} />
									<span class="size-chart-icon" aria-hidden="true">
										<Folder size={16} />
									</span>
									<span class="size-chart-name">{leaf.path}</span>
									<div class="size-chart-value">
										<div class="size-chart-bytes">{formatBytes(leaf.bytes)}</div>
										<div class="size-chart-meta">{formatFileStats(leaf.bytes, leaf.fileCount, leaf.maxFileBytes)}</div>
									</div>
								</RowButton>

								{leaf.files?.map((f) => (
									<RowButton
										key={f.absolutePath}
										class="size-chart-row file"
										onClick={() => onReveal(f.absolutePath)}
										title={`Reveal ${f.name}`}
									>
										<span class="size-chart-icon" aria-hidden="true">
											<FileIcon size={16} />
										</span>
										<span class="size-chart-name">{f.name}</span>
										<div class="size-chart-value">
											<div class="size-chart-bytes">{formatBytes(f.bytes)}</div>
										</div>
									</RowButton>
								))}
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}
