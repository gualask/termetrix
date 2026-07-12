import * as vscode from 'vscode';
import { LOCScanner } from '../locScan/locScanner';
import type { ProjectSizeScanner } from '../sizeScan/projectSizeScanner';
import { createMetricsPanelCommandHandlers, type MetricsPanelCommandDeps } from './commands/metricsPanelCommands';
import { MetricsPanelController } from './controller/metricsPanelController';
import { MetricsPanelSessionState } from './state/metricsPanelSessionState';
import { MetricsPanelView } from './view/metricsPanelView';

/**
 * Webview panel orchestrator for project metrics visualization.
 * Lives under `extension/vscode` (host-side only).
 */
export class MetricsPanel implements vscode.Disposable {
	private readonly locScanner = new LOCScanner();
	private readonly commandHandlers: ReturnType<typeof createMetricsPanelCommandHandlers>;
	private readonly sessionState = new MetricsPanelSessionState();
	private readonly view: MetricsPanelView;
	private readonly controller: MetricsPanelController;

	/**
	 * Creates a metrics panel controller.
	 * @param scanner - Scanner used for size scans and breakdown computation.
	 * @param extensionUri - Extension URI used to resolve webview asset paths.
	 */
	constructor(
		private readonly scanner: ProjectSizeScanner,
		extensionUri: vscode.Uri,
	) {
		this.view = new MetricsPanelView(extensionUri);
		this.commandHandlers = createMetricsPanelCommandHandlers(this.createCommandDeps());
		this.controller = new MetricsPanelController({
			scanner: this.scanner,
			locScanner: this.locScanner,
			view: this.view,
			sessionState: this.sessionState,
			commandHandlers: this.commandHandlers,
		});
	}

	/**
	 * Builds the dependency object consumed by metrics panel command handlers.
	 * @returns Command handler dependencies bound to this panel instance.
	 */
	private createCommandDeps(): MetricsPanelCommandDeps {
		return {
			scanner: this.scanner,
			locScanner: this.locScanner,
			sessionState: this.sessionState,
			isPanelOpen: () => this.view.isOpen(),
			getPreferredEditorColumn: () => this.sessionState.getPreferredEditorColumn(),
			sendMessage: (message) => this.view.postMessage(message),
		};
	}

	/**
	 * Returns true when the webview panel is currently open.
	 * @returns True when open.
	 */
	isOpen(): boolean {
		return this.view.isOpen();
	}

	/**
	 * Shows the panel if it is not open; otherwise focuses it.
	 * @returns void
	 */
	show(): void {
		// Capture the current user editor column before focusing/creating the webview.
		this.sessionState.updatePreferredEditorColumnFrom(vscode.window.activeTextEditor);

		if (this.view.isOpen()) {
			// If already open, just focus (panel session state lives in the webview already).
			this.view.reveal();
			return;
		}

		this.controller.reset();
		const panel = this.view.ensureOpen();
		this.controller.attach(panel);
	}

	/**
	 * Disposes the panel and all subscriptions.
	 * @returns void
	 */
	dispose(): void {
		this.controller.dispose();
		this.view.dispose();
	}
}
