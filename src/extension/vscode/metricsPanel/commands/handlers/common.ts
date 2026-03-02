import type { MessageToExtension } from '../../../../types';
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
