import type { ComponentChildren } from 'preact';

interface Props {
	onClick: () => void;
	disabled?: boolean;
	title: string;
	ariaLabel: string;
	children: ComponentChildren;
}

export function IconButton({ onClick, disabled, title, ariaLabel, children }: Props) {
	return (
		<button
			type="button"
			class="tmx-icon-button"
			onClick={onClick}
			disabled={disabled}
			title={title}
			aria-label={ariaLabel}
		>
			{children}
		</button>
	);
}
