import type { FsPort } from '../ports/fsPort';
import type { CancellationToken } from '../shared/runtime/cancellationToken';
import type { LocPathFilter } from './filtering/locPathFilter';

export interface LocScanRequest {
	rootPath: string;
	fs: FsPort;
	cancellationToken?: CancellationToken;
	pathFilter?: LocPathFilter;
	maxConcurrency?: number;
}
