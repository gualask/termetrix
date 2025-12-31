import type { ComponentChildren } from 'preact';

type PanelVariant = 'fixed' | 'scroll';

interface Props {
	viewClass: string;
	header: ComponentChildren;
	panelVariant: PanelVariant;
	panelAriaLabel: string;
	children: ComponentChildren;
}

function panelVariantClass(variant: PanelVariant): string {
	return variant === 'scroll' ? 'tmx-panel-scroll' : 'tmx-panel-fixed';
}

export function ViewLayout({ viewClass, header, panelVariant, panelAriaLabel, children }: Props) {
	return (
		<div class={`content ${viewClass}`}>
			{header}
			<section class={`tmx-panel-card ${panelVariantClass(panelVariant)}`} aria-label={panelAriaLabel}>
				{children}
			</section>
		</div>
	);
}
