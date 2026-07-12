function unsupported(api: string): never {
	throw new Error(`VS Code API is unavailable in unit tests: ${api}`);
}

/** Runtime stand-in that fails explicitly if a unit test reaches a VS Code API. */
export const window = {
	createOutputChannel: () => unsupported('window.createOutputChannel'),
};

/** Runtime stand-in that fails explicitly if a unit test reaches a VS Code API. */
export const workspace = {
	getConfiguration: () => unsupported('workspace.getConfiguration'),
};
