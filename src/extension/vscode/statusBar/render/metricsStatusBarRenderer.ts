import * as vscode from 'vscode';
import { formatIncompleteReason } from '../../../../shared/formatters';
import { SCANNING_PROJECT_LABEL } from '../../../support/constants';
import type { ProgressData, ScanResult } from '../../../types';

export type MetricsStatusBarRenderInput = {
	rootPath: string | undefined;
	scanResult: ScanResult | undefined;
	isScanning: boolean;
	progress: ProgressData | undefined;
};

export type MetricsStatusBarRenderOutput = {
	text: string;
	tooltip: string | vscode.MarkdownString;
};

/**
 * Renders metrics status bar content from current scan state.
 * Single responsibility: status bar text/tooltip formatting.
 */
export class MetricsStatusBarRenderer {
	constructor(private readonly formatBytes: (bytes: number) => string) {}

	render(input: MetricsStatusBarRenderInput): MetricsStatusBarRenderOutput {
		const { rootPath, scanResult, isScanning, progress } = input;

		if (!rootPath) {
			return { text: '$(database) —', tooltip: 'No project root detected' };
		}

		if (isScanning) return this.renderWithProgress(progress);
		return this.renderIdle(scanResult);
	}

	/**
	 * Formats a timestamp into a human-readable "time ago" string.
	 * @param timestamp - Epoch timestamp in milliseconds.
	 * @returns Human-readable time ago string (e.g., "2 minutes ago").
	 */
	private formatTimeAgo(timestamp: number): string {
		const now = Date.now();
		const diffSeconds = Math.floor((now - timestamp) / 1000);

		if (diffSeconds < 10) return 'just now';
		if (diffSeconds < 60) return `${diffSeconds} seconds ago`;

		const diffMinutes = Math.floor(diffSeconds / 60);
		if (diffMinutes === 1) return '1 minute ago';
		if (diffMinutes < 60) return `${diffMinutes} minutes ago`;

		const diffHours = Math.floor(diffMinutes / 60);
		if (diffHours === 1) return '1 hour ago';
		if (diffHours < 24) return `${diffHours} hours ago`;

		const diffDays = Math.floor(diffHours / 24);
		if (diffDays === 1) return '1 day ago';
		return `${diffDays} days ago`;
	}

	/**
	 * Creates a rich tooltip with detailed scan information.
	 * @param scanResult - Last completed scan result.
	 * @returns Rich MarkdownString tooltip.
	 */
	private createRichTooltip(scanResult: ScanResult): vscode.MarkdownString {
		const tooltip = new vscode.MarkdownString();

		// Header with project size
		tooltip.appendMarkdown(`**Project Size**: ${this.formatBytes(scanResult.totalBytes)}\n\n`);

		// Scan metadata
		const timeAgo = this.formatTimeAgo(scanResult.metadata.endTime);
		tooltip.appendMarkdown(`**Last scan**: ${timeAgo}\n\n`);

		// Scan details
		tooltip.appendMarkdown(`**Directories**: ${scanResult.metadata.directoriesScanned.toLocaleString()}\n\n`);
		tooltip.appendMarkdown(`**Duration**: ${(scanResult.metadata.duration / 1000).toFixed(1)}s\n\n`);

		// Warning for incomplete scans
		if (scanResult.incomplete) {
			tooltip.appendMarkdown(`$(warning) ${formatIncompleteReason(scanResult.incompleteReason)}\n\n`);
		}

		// Skipped directories info
		if (scanResult.skippedCount > 0) {
			tooltip.appendMarkdown(`$(info) Skipped ${scanResult.skippedCount} unreadable entries\n\n`);
		}

		// Call to action
		tooltip.appendMarkdown(`---\n\n`);
		tooltip.appendMarkdown(`Click to view detailed breakdown`);

		return tooltip;
	}

	private renderWithProgress(progress: ProgressData | undefined): MetricsStatusBarRenderOutput {
		const bytesText = progress && progress.bytesScanned > 0 ? this.formatBytes(progress.bytesScanned) : '...';
		return {
			text: `$(database) ${bytesText}`,
			tooltip: SCANNING_PROJECT_LABEL,
		};
	}

	private renderIdle(scanResult: ScanResult | undefined): MetricsStatusBarRenderOutput {
		if (!scanResult) {
			return {
				text: '$(database) —',
				tooltip: 'No scan yet (click to open Metrics Panel)',
			};
		}

		let text = `$(database) ${this.formatBytes(scanResult.totalBytes)}`;
		if (scanResult.incomplete) text += ' $(warning)';

		return {
			text,
			tooltip: this.createRichTooltip(scanResult),
		};
	}
}
