function unsupported(api: string): never {
	throw new Error(`VS Code API is unavailable in unit tests: ${api}`);
}

/** Minimal cancellation source used by host-side lifecycle unit tests. */
export class CancellationTokenSource {
	private cancelled = false;
	readonly token: { readonly isCancellationRequested: boolean };

	constructor() {
		const source = this;
		this.token = {
			get isCancellationRequested() {
				return source.cancelled;
			},
		};
	}

	cancel(): void {
		this.cancelled = true;
	}

	dispose(): void {}
}

/** Runtime stand-in that fails explicitly if a unit test reaches a VS Code API. */
export const window = {
	createOutputChannel: () => unsupported('window.createOutputChannel'),
};

/** Runtime stand-in that fails explicitly if a unit test reaches a VS Code API. */
export const workspace = {
	getConfiguration: () => unsupported('workspace.getConfiguration'),
};
