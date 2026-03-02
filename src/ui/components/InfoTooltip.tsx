import { Info } from 'lucide-preact';
import { TooltipBubble } from './TooltipBubble';

interface Props {
	lines: string[];
}

export function InfoTooltip({ lines }: Props) {
	return (
		<div class="tmx-info-tooltip">
			<Info size={14} aria-hidden="true" />
			<TooltipBubble lines={lines} />
		</div>
	);
}
