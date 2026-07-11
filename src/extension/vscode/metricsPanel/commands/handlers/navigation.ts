import * as vscode from 'vscode';
import { VSCODE_COMMAND_IDS } from '../../../../support/constants';
import type { MessageToExtension } from '../../../../types';
import { PANEL_COMMAND_ERRORS, type PanelCommandErrorSpec } from '../errors';
import { resolvePanelPath, runPanelCommand } from '../metricsPanelCommandUtils';
import type { MetricsPanelCommandDeps, MetricsPanelCommandHandler } from '../types';
import { getMessagePath } from './common';

async function runWithResolvedPanelPath(
	deps: MetricsPanelCommandDeps,
	targetPath: string | undefined,
	error: PanelCommandErrorSpec,
	runWithPath: (absolutePath: string) => Promise<void>,
): Promise<void> {
	const absolutePath = resolvePanelPath(deps, targetPath);
	if (!absolutePath) return;

	await runPanelCommand({
		deps,
		error,
		run: async () => runWithPath(absolutePath),
	});
}

async function onRevealInExplorer(deps: MetricsPanelCommandDeps, targetPath: string | undefined): Promise<void> {
	await runWithResolvedPanelPath(deps, targetPath, PANEL_COMMAND_ERRORS.revealInExplorer, async (absolutePath) => {
		const uri = vscode.Uri.file(absolutePath);
		await vscode.commands.executeCommand(VSCODE_COMMAND_IDS.revealInExplorer, uri);
	});
}

async function onOpenFile(deps: MetricsPanelCommandDeps, filePath: string | undefined): Promise<void> {
	await runWithResolvedPanelPath(deps, filePath, PANEL_COMMAND_ERRORS.openFile, async (absolutePath) => {
		const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absolutePath));
		await vscode.window.showTextDocument(doc, {
			preview: true,
			viewColumn: deps.getPreferredEditorColumn() ?? vscode.ViewColumn.One,
		});
	});
}

export function createNavigationHandlers(
	deps: MetricsPanelCommandDeps,
): Pick<Record<MessageToExtension['command'], MetricsPanelCommandHandler>, 'revealInExplorer' | 'openFile'> {
	return {
		revealInExplorer: (message) => onRevealInExplorer(deps, getMessagePath(message)),
		openFile: (message) => onOpenFile(deps, getMessagePath(message)),
	};
}
