export interface PanelCommandErrorSpec {
	logLabel: string;
	message: string;
	code: string;
}

export const PANEL_COMMAND_ERRORS = {
	sizeScan: {
		logLabel: 'size scan failed',
		message: 'Project scan failed. Try refreshing or check the output channel for details.',
		code: 'panel.scan',
	},
	locScan: {
		logLabel: 'calculateLOC failed',
		message: 'Lines of code calculation failed. Try again or check the output channel for details.',
		code: 'panel.calculateLOC',
	},
	revealInExplorer: {
		logLabel: 'revealInExplorer failed',
		message: 'Could not reveal path in Explorer. The file or folder may have been moved or deleted.',
		code: 'panel.revealInExplorer',
	},
	openFile: {
		logLabel: 'openFile failed',
		message: 'Could not open file. The file may have been moved or deleted.',
		code: 'panel.openFile',
	},
} as const satisfies Record<string, PanelCommandErrorSpec>;
