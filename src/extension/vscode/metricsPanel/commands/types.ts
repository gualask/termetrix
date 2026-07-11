import type * as vscode from 'vscode';
import type { MessageFromExtension, MessageToExtension } from '../../../types';
import type { LOCScanner } from '../../locScan/locScanner';
import type { ProjectSizeScanner } from '../../sizeScan/projectSizeScanner';
import type { MetricsPanelSessionState } from '../state/metricsPanelSessionState';

/**
 * Metrics panel command handler signature.
 */
export type MetricsPanelCommandHandler = (message: MessageToExtension) => void | Promise<void>;

/**
 * Command handler dependencies for metrics panel messages.
 */
export interface MetricsPanelCommandDeps {
	scanner: ProjectSizeScanner;
	locScanner: LOCScanner;
	sessionState: MetricsPanelSessionState;
	isPanelOpen: () => boolean;
	getPreferredEditorColumn: () => vscode.ViewColumn | undefined;
	sendMessage: (message: MessageFromExtension) => void;
}
