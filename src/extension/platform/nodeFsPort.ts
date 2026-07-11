import * as fs from 'node:fs/promises';
import type { DirEntry, FsPort, StatLike } from '../../core/ports/fsPort';

/**
 * Node.js implementation of the core filesystem port.
 */
export class NodeFsPort implements FsPort {
	async readDir(dirPath: string): Promise<ReadonlyArray<DirEntry>> {
		// Note: return Node.js `Dirent` objects directly (structurally matches `DirEntry`).
		// This avoids per-entry mapping/allocation on the scan hot path.
		return await fs.readdir(dirPath, { withFileTypes: true });
	}

	async stat(absolutePath: string): Promise<StatLike> {
		const stats = await fs.stat(absolutePath);
		return { size: stats.size };
	}

	async readFile(absolutePath: string, encoding: 'utf8'): Promise<string> {
		return await fs.readFile(absolutePath, encoding);
	}
}
