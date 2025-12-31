import { Loader2 } from 'lucide-preact';

interface Props {
	label: string;
}

export function PanelOverlay({ label }: Props) {
	return (
		<div class="tmx-panel-overlay" aria-live="polite">
			<Loader2 size={28} class="spinner" />
			<span>{label}</span>
		</div>
	);
}
