interface Props {
	title?: string;
	message: string;
	hint?: string;
}

export function EmptyState({ title, message, hint }: Props) {
	return (
		<div class="empty-state">
			{title && <h2>{title}</h2>}
			<p>{message}</p>
			{hint && <p class="hint">{hint}</p>}
		</div>
	);
}

