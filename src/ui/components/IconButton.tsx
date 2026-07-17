import type { ComponentChildren } from 'preact';

interface Props {
	onClick: () => void;
	disabled?: boolean;
	title: string;
	ariaLabel: string;
	/** For toggle buttons controlling a collapsible region. */
	ariaExpanded?: boolean;
	children: ComponentChildren;
}

export function IconButton({ onClick, disabled, title, ariaLabel, ariaExpanded, children }: Props) {
	return (
		<button
			type="button"
			class="tmx-icon-button"
			onClick={onClick}
			disabled={disabled}
			title={title}
			aria-label={ariaLabel}
			aria-expanded={ariaExpanded}
		>
			{children}
		</button>
	);
}
