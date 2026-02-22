export type DirEntry = {
	name: string;
	isDirectory(): boolean;
	isFile(): boolean;
	isSymbolicLink(): boolean;
};

export type StatLike = { size: number };

/**
 * Minimal filesystem port used by core scan engines.
 * Implementations live in the extension (Node/VSC adapters).
 */
export interface FsPort {
	readDir(dirPath: string): Promise<ReadonlyArray<DirEntry>>;
	stat(absolutePath: string): Promise<StatLike>;
	readFile(absolutePath: string, encoding: 'utf8'): Promise<string>;
}
