/**
 * Segment marker used to represent the project root in breakdown models.
 * Shared sentinel across core + UI to avoid "magic string" drift.
 */
export const SIZE_BREAKDOWN_ROOT_SEGMENT = '.' as const;

export interface SizeBreakdownLeafDirectory {
	kind: 'leafDirectory';
	/** Display path (relative to the top-level parent; uses `/` separators) */
	path: string;
	/** Absolute path */
	absolutePath: string;
	/** Direct size in bytes (non-recursive; files directly under this directory) */
	bytes: number;
	/** Direct file count in this directory (non-recursive) */
	fileCount: number;
	/** Max direct file size in bytes (non-recursive) */
	maxFileBytes: number;
	/** Basename of the largest direct file, if known */
	maxFileName?: string;
}

export interface SizeBreakdownOthers {
	kind: 'others';
	/** Remaining size in bytes (relative to the parent) */
	bytes: number;
	/** File count inside "others" */
	fileCount: number;
	/** Max file size inside "others" */
	maxFileBytes: number;
	/** Leaf directory count aggregated in "others" */
	leafDirs: number;
}

export interface SizeBreakdownParent {
	kind: 'parent';
	/**
	 * Top-level directory segment name (relative to scan root).
	 * Uses "." for files directly under the project root.
	 */
	path: string;
	/** Absolute path */
	absolutePath: string;
	/** Total size in bytes for this subtree (derived from summed direct metrics) */
	bytes: number;
	/** Total file count in this subtree */
	fileCount: number;
	/** Max file size in this subtree */
	maxFileBytes: number;
	entries: Array<SizeBreakdownLeafDirectory | SizeBreakdownOthers>;
}

export interface SizeBreakdownResult {
	rootPath: string;
	parents: SizeBreakdownParent[];
	/** Top-level directories not shown because they fell below the selection threshold */
	hiddenParents?: { count: number; bytes: number };
}
