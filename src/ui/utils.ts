import { formatBytes, formatIncompleteReason } from '../shared/formatters';

export { formatBytes, formatIncompleteReason };

export function formatRelativeTime(endTime: number, now: number): string {
	const elapsed = now - endTime;
	if (elapsed < 30_000) return 'just now';
	if (elapsed < 60_000) return `${Math.floor(elapsed / 1000)}s ago`;
	if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
	return `${Math.floor(elapsed / 3_600_000)}h ago`;
}
