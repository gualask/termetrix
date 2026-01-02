export type SizeScanInternals = {
	directorySizes: Record<string, number>;
	directoryFileCounts?: Record<string, number>;
	directoryMaxFileBytes?: Record<string, number>;
	topFilesByDirectory?: Record<string, Array<{ absolutePath: string; name: string; bytes: number }>>;
};

