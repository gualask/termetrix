import type { LOCResult } from '../../../shared/contracts/loc';
import { TOP_FILES_LIMIT } from '../locConfig';
import type { LocTopFile } from '../../../shared/contracts/loc';
import { insertBoundedDescending } from '../../shared/collections/boundedDescendingInsert';

const getLocTopFileLines = (f: LocTopFile): number => f.lines;

/**
 * Aggregates LOC scan results.
 * Single responsibility: mutate and finalize LOCResult.
 */
export class LocAccumulator {
	private readonly topFiles: LocTopFile[] = [];
	private totalLines = 0;
	private readonly byLanguage: Record<string, number> = {};
	private scannedFiles = 0;
	private skippedFiles = 0;

	incrementSkipped(): void {
		this.skippedFiles++;
	}

	addCountedFile(file: LocTopFile): void {
		this.totalLines += file.lines;
		this.byLanguage[file.language] = (this.byLanguage[file.language] ?? 0) + file.lines;
		this.scannedFiles++;
		insertBoundedDescending(this.topFiles, file, TOP_FILES_LIMIT, getLocTopFileLines);
	}

	finalize(): LOCResult {
		return {
			totalLines: this.totalLines,
			byLanguage: this.byLanguage,
			topFiles: this.topFiles,
			scannedFiles: this.scannedFiles,
			skippedFiles: this.skippedFiles,
		};
	}
}
