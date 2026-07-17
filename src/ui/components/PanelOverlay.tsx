import { LoaderCircle } from 'lucide-preact';

interface Props {
	label: string;
}

export function PanelOverlay({ label }: Props) {
	return (
		<div class="tmx-panel-overlay" aria-live="polite">
			<LoaderCircle size={28} class="spinner" />
			<span>{label}</span>
		</div>
	);
}
