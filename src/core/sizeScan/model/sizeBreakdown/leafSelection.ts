import * as path from 'path';
import type { SizeBreakdownLeafDirectory } from '../../../../shared/contracts/sizeBreakdown';
import type { DirectoryMetricsSnapshot } from '../../types';
import type { CandidateDirectory } from './types';
import type { BreakdownSelectionPolicy } from './options';
import { DirectoryAggregate } from './directoryAggregate';

/**
 * Converts a relative path to a display-friendly path using POSIX separators.
 * @param relativePath - Path relative to a parent directory.
 * @returns Display path using `/` separators.
 */
function toDisplayPath(relativePath: string): string {
	// `path.relative` uses platform separators; normalize for the UI contract (`/`).
	return relativePath.replace(/\\/g, '/');
}

/**
 * Selects the most relevant leaf directories for a parent segment based on:
 * - descending bytes order
 * - a minimum per-item threshold (relative to the parent)
 * - a coverage target (stop once enough bytes are covered)
 * @param params - Input values.
 * @returns Selection results including selected entries and their totals.
 */
export function selectLeafDirectories(params: {
	parentAbsolutePath: string;
	parentBytes: number;
	leafEntries: CandidateDirectory[];
	selectionPolicy: BreakdownSelectionPolicy;
	directoryMetrics: DirectoryMetricsSnapshot;
}): {
	selected: SizeBreakdownLeafDirectory[];
	selectedTotals: DirectoryAggregate;
	selectedLeafDirSet: Set<string>;
} {
	const {
		parentAbsolutePath,
		parentBytes,
		leafEntries,
		selectionPolicy,
		directoryMetrics,
	} = params;

	// Biggest first, so selection converges quickly.
	leafEntries.sort((a, b) => b.totals.bytes - a.totals.bytes);

	const selected: SizeBreakdownLeafDirectory[] = [];
	const selectedLeafDirSet = new Set<string>();

	let selectedTotals = DirectoryAggregate.empty();

	for (const entry of leafEntries) {
		// Stop when we have enough items or remaining items are too small.
		if (
			selectionPolicy.shouldStopBeforeSelecting({
				selectedCount: selected.length,
				candidateBytes: entry.totals.bytes,
				parentBytes,
			})
		) {
			break;
		}

		const rawRelative = path.relative(parentAbsolutePath, entry.absolutePath);
		const displayRelative = rawRelative ? toDisplayPath(rawRelative) : '.';
		const maxFileName = directoryMetrics[entry.absolutePath]?.maxFileName;
		const leafDir: SizeBreakdownLeafDirectory = {
			kind: 'leafDirectory',
			path: displayRelative,
			absolutePath: entry.absolutePath,
			bytes: entry.totals.bytes,
			fileCount: entry.totals.fileCount,
			maxFileBytes: entry.totals.maxFileBytes,
			...(maxFileName !== undefined && { maxFileName }),
		};

		selected.push(leafDir);
		selectedLeafDirSet.add(entry.absolutePath);

		selectedTotals = selectedTotals.merge(entry.totals);

		// Stop once we've covered enough of the parent's bytes.
		if (
			selectionPolicy.hasReachedCoverage({
				parentBytes,
				selectedBytes: selectedTotals.bytes,
			})
		) {
			break;
		}
	}

	return { selected, selectedTotals, selectedLeafDirSet };
}
