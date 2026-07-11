import type { ComponentChildren } from 'preact';
import { TooltipBubble } from '../../components/TooltipBubble';
import { buildSizeMetricTooltipLines, SizeMetric } from './SizeMetric';

type SizeTableRowKind = 'leaf' | 'others';

interface SizeTableRowProps {
	kind: SizeTableRowKind;
	icon: ComponentChildren;
	name: string;
	subtitle?: string;
	size: number;
	fileCount?: number;
	maxFileBytes?: number;
	share?: number; // 0..1
	title?: string;
	/** When false, renders as static div instead of button. Default: true */
	interactive?: boolean;
	onClick?: () => void;
}

export function SizeTableRow({
	kind,
	icon,
	name,
	subtitle,
	size,
	fileCount,
	maxFileBytes,
	share,
	interactive = true,
	onClick,
	title,
}: SizeTableRowProps) {
	const bubbleLines =
		kind === 'leaf'
			? []
			: [
					...(title ? [title] : []),
					...buildSizeMetricTooltipLines({
						sizeBytes: size,
						share,
						variant: 'parent',
						fileCount,
						maxFileBytes,
					}),
				];

	const content = (
		<div class="size-table-grid">
			<div class="size-table-nameCell">
				<div class="size-table-nameTop">
					<span class="size-table-icon" aria-hidden="true">
						{icon}
					</span>
					<span class="size-table-name">{name}</span>
				</div>
				{subtitle && <div class="size-table-subtitle">{subtitle}</div>}
			</div>

			<div class="size-table-metricsCell">
				<SizeMetric sizeBytes={size} share={share} variant="parent" />
			</div>
		</div>
	);

	if (!interactive) {
		return (
			<div class={`size-table-row size-table-row--${kind} size-table-row--static`}>
				<TooltipBubble lines={bubbleLines} />
				{content}
			</div>
		);
	}

	return (
		<button
			type="button"
			class={`tmx-row size-table-row size-table-row--${kind}`}
			onClick={onClick}
			aria-label={`Reveal ${name} in Explorer`}
		>
			<TooltipBubble lines={bubbleLines} />
			{content}
		</button>
	);
}
