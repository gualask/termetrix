import { AlertTriangle, X } from 'lucide-preact';
import type { ErrorData } from '../types';

interface Props {
	error: ErrorData;
	onDismiss?: () => void;
}

export function ErrorBanner({ error, onDismiss }: Props) {
	return (
		<div class="error-banner" role="alert" aria-live="assertive">
			<AlertTriangle size={18} class="error-banner-icon" aria-hidden="true" />
			<div class="error-banner-content">
				<div class="error-banner-message">{error.message}</div>
				{error.code && (
					<div class="error-banner-details">Error code: {error.code}</div>
				)}
			</div>
			{onDismiss && (
				<button
					class="error-banner-dismiss"
					onClick={onDismiss}
					title="Dismiss error"
					aria-label="Dismiss error"
				>
					<X size={16} />
				</button>
			)}
		</div>
	);
}
