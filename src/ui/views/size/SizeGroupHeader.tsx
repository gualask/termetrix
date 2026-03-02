import type { ComponentChildren } from 'preact';
import { RowButton } from '../../components/RowButton';
import { TooltipBubble } from '../../components/TooltipBubble';
import { buildSizeMetricTooltipLines, SizeMetric } from './SizeMetric';

interface SizeGroupHeaderProps {
	icon: ComponentChildren;
	name: string;
	size: number;
	fileCount: number;
	maxFileBytes: number;
	shareOfTotal: number; // 0..1
	onClick: () => void;
}

export function SizeGroupHeader({ icon, name, size, fileCount, maxFileBytes, shareOfTotal, onClick }: SizeGroupHeaderProps) {
	const tooltipLines = buildSizeMetricTooltipLines({
		sizeBytes: size,
		share: shareOfTotal,
		variant: 'total',
		fileCount,
		maxFileBytes,
	});

	return (
		<RowButton class="size-groupHeader" onClick={onClick} ariaLabel={`Reveal ${name} in Explorer`}>
			<TooltipBubble lines={tooltipLines} />
			<div class="size-groupHeaderGrid">
				<div class="size-groupHeaderName">
					<span class="size-groupHeaderIcon" aria-hidden="true">
						{icon}
					</span>
					<span class="size-groupHeaderText">{name}</span>
				</div>

				<div class="size-groupHeaderMetrics">
					<SizeMetric
						sizeBytes={size}
						share={shareOfTotal}
						variant="total"
					/>
				</div>
			</div>
		</RowButton>
	);
}
