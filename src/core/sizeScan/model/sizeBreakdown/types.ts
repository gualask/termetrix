import type { DirectoryAggregate } from './directoryAggregate';

export type CandidateDirectory = {
	absolutePath: string;
	totals: DirectoryAggregate;
};
