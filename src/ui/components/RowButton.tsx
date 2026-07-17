import type { ComponentChildren } from 'preact';

interface Props {
	class?: string;
	onClick?: () => void;
	disabled?: boolean;
	title?: string;
	ariaLabel?: string;
	describedBy?: string;
	children: ComponentChildren;
}

export function RowButton({ class: className, onClick, disabled, title, ariaLabel, describedBy, children }: Props) {
	const classes = className ? `tmx-row ${className}` : 'tmx-row';

	return (
		<button
			type="button"
			class={classes}
			onClick={onClick}
			disabled={disabled}
			title={title}
			aria-label={ariaLabel}
			aria-describedby={describedBy}
		>
			{children}
		</button>
	);
}
