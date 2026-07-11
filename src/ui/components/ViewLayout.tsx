import type { ComponentChildren } from 'preact';

interface Props {
	viewClass: string;
	header: ComponentChildren;
	bodyAriaLabel: string;
	isCollapsed: boolean;
	scrollable?: boolean;
	children: ComponentChildren;
}

export function ViewLayout({ viewClass, header, bodyAriaLabel, isCollapsed, scrollable, children }: Props) {
	return (
		<div class={`tmx-section ${viewClass}`}>
			{header}
			{!isCollapsed && (
				<div
					class={`tmx-section-body${scrollable ? ' tmx-section-body--scroll' : ''}`}
					role="group"
					aria-label={bodyAriaLabel}
				>
					{children}
				</div>
			)}
		</div>
	);
}
