interface TooltipBubbleProps {
	lines: string[];
}

export function TooltipBubble({ lines }: TooltipBubbleProps) {
	if (!lines.length) return null;

	return (
		<div class="tmx-tooltip" aria-hidden="true">
			{lines.map((line) => (
				<div key={line} class="tmx-tooltipLine">
					{line}
				</div>
			))}
		</div>
	);
}
