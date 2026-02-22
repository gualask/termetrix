export interface ScanMetadata {
	/** Timestamp when scan started */
	startTime: number;
	/** Timestamp when scan completed */
	endTime: number;
	/** Duration in milliseconds */
	duration: number;
	/** Number of directories scanned */
	directoriesScanned: number;
}

export type ScanIncompleteReason = 'cancelled' | 'time_limit' | 'dir_limit';

export interface ScanResult {
	/** Root path that was scanned */
	rootPath: string;
	/** Total size in bytes */
	totalBytes: number;
	/** Scan metadata */
	metadata: ScanMetadata;
	/** Whether scan was incomplete */
	incomplete: boolean;
	/** Reason for incompleteness */
	incompleteReason?: ScanIncompleteReason;
	/** Number of filesystem entries skipped due to permission errors */
	skippedCount: number;
}
