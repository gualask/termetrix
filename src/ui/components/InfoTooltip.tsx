import { Info } from 'lucide-preact';
import { useId } from 'preact/hooks';
import { TooltipBubble } from './TooltipBubble';

interface Props {
	lines: string[];
	label?: string;
}

export function InfoTooltip({ lines, label = 'More info' }: Props) {
	const tooltipId = useId();

	return (
		<button
			type="button"
			class="tmx-info-tooltip"
			aria-label={label}
			aria-describedby={tooltipId}
			onKeyDown={(event) => {
				if (event.key === 'Escape') event.currentTarget.blur();
			}}
		>
			<Info size={14} aria-hidden="true" />
			<TooltipBubble id={tooltipId} lines={lines} />
		</button>
	);
}
