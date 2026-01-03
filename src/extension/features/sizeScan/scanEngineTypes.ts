export interface ScanRuntimeState {
	totalBytes: number;
	directoriesScanned: number;
	skippedCount: number;
	incomplete: boolean;
	incompleteReason: 'cancelled' | 'time_limit' | 'dir_limit' | undefined;
	stopScheduling: boolean;
}

export interface SizeScanConfig {
	maxDurationSeconds: number;
	maxDirectories: number;
	concurrentOperations: number;
}

export interface SizeScanProgress {
	totalBytes: number;
	directoriesScanned: number;
}

export interface SizeScanCancellationToken {
	isCancellationRequested: boolean;
}

export interface SizeScanParams {
	rootPath: string;
	config: SizeScanConfig;
	cancellationToken: SizeScanCancellationToken;
	onProgress?: (progress: SizeScanProgress) => void;
	options?: {
		collectDirectorySizes?: boolean;
		collectTopDirectories?: boolean;
		topDirectoriesLimit?: number;
	};
}

export type TopFile = { absolutePath: string; name: string; bytes: number };
