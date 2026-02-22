import type { ComponentChildren } from 'preact';

type Variant = 'page' | 'panel' | 'inline';

interface Props {
	title?: string;
	message: string;
	hint?: string;
	variant?: Variant;
	leading?: ComponentChildren;
}

export function EmptyState({ title, message, hint, variant = 'panel', leading }: Props) {
	return (
		<div class={`empty-state variant-${variant}`}>
			{leading}
			{title && <h2>{title}</h2>}
			<p>{message}</p>
			{hint && <p class="hint">{hint}</p>}
		</div>
	);
}
