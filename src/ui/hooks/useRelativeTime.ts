import { useState, useEffect } from 'preact/hooks';
import { formatRelativeTime } from '../utils';

export function useRelativeTime(endTime: number | undefined): string | undefined {
	const [label, setLabel] = useState<string | undefined>(
		() => endTime !== undefined ? formatRelativeTime(endTime, Date.now()) : undefined
	);

	useEffect(() => {
		if (endTime === undefined) {
			setLabel(undefined);
			return;
		}
		setLabel(formatRelativeTime(endTime, Date.now()));
		const interval = setInterval(() => setLabel(formatRelativeTime(endTime, Date.now())), 30_000);
		return () => clearInterval(interval);
	}, [endTime]);

	return label;
}
