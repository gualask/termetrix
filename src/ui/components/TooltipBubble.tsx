interface TooltipBubbleProps {
	lines: string[];
	/** When set, the bubble can be referenced via aria-describedby on the trigger. */
	id?: string;
}

export function TooltipBubble({ lines, id }: TooltipBubbleProps) {
	if (!lines.length) return null;

	return (
		<div id={id} class="tmx-tooltip" aria-hidden="true">
			{lines.map((line) => (
				<div key={line} class="tmx-tooltipLine">
					{line}
				</div>
			))}
		</div>
	);
}
