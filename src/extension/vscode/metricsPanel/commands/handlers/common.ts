import type { MessageToExtension, MetricsTab } from '../../../../types';
import { parsePanelTargetPath } from '../panelTargetPath';

export function getMessagePath(message: MessageToExtension): string | undefined {
	switch (message.command) {
		case 'revealInExplorer':
		case 'openFile':
			return parsePanelTargetPath(message.path);
		default:
			return undefined;
	}
}

export function getMessageTab(message: MessageToExtension): MetricsTab | undefined {
	return message.command === 'tabActivated' ? message.tab : undefined;
}
