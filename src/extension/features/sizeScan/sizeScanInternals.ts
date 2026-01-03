export type SizeScanInternals = {
	// Kept in-memory only during an open webview session; not persisted in `ScanCache`.
	directorySizes: Record<string, number>;
	directoryFileCounts?: Record<string, number>;
	directoryMaxFileBytes?: Record<string, number>;
	topFilesByDirectory?: Record<string, Array<{ absolutePath: string; name: string; bytes: number }>>;
};
