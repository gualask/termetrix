interface TooltipBubbleProps {
	lines: string[];
}

export function TooltipBubble({ lines }: TooltipBubbleProps) {
	if (!lines.length) return null;

	return (
		<div class="tmx-tooltip" role="tooltip" aria-hidden="true">
			{lines.map((line, index) => (
				<div key={`${index}-${line}`} class="tmx-tooltipLine">
					{line}
				</div>
			))}
		</div>
	);
}
