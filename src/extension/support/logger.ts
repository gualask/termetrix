import * as vscode from 'vscode';
import { configManager } from './configManager';
import { OUTPUT_CHANNEL_NAME } from './constants';

/**
 * Centralized logging utility for the extension.
 * Logs to a dedicated Output Channel ("Termetrix") with configurable verbosity.
 *
 * Lives under `extension/support` (host-side only).
 *
 * Usage:
 *   logger.error('Something went wrong');         // Always logged
 *   logger.warn('Performance degraded');          // Always logged
 *   logger.info('Scan completed in 520ms');       // Only if verbose enabled
 *   logger.debug('Cache hit for /src');           // Only if verbose enabled
 */
class Logger {
	private outputChannel: vscode.OutputChannel | undefined;

	/**
	 * Initializes the logger with a dedicated Output Channel.
	 * Should be called once during extension activation.
	 * @returns void
	 */
	initialize(): void {
		if (this.outputChannel) return;
		this.outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
	}

	/**
	 * Disposes the output channel.
	 * @returns void
	 */
	dispose(): void {
		this.outputChannel?.dispose();
		this.outputChannel = undefined;
	}

	/**
	 * Returns true if verbose logging is enabled in settings.
	 * @returns True when verbose logging is enabled.
	 */
	private isVerboseEnabled(): boolean {
		return configManager.isVerboseLoggingEnabled();
	}

	/**
	 * Logs a message with timestamp and level prefix.
	 * @param level - Log level.
	 * @param message - Message to log.
	 * @returns void
	 */
	private log(level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG', message: string): void {
		if (!this.outputChannel) return;

		const timestamp = new Date().toISOString();
		const formattedMessage = `[${timestamp}] [${level}] ${message}`;

		this.outputChannel.appendLine(formattedMessage);
	}

	/**
	 * Logs an error message (always logged, regardless of verbose setting).
	 * @param message - Error message.
	 * @returns void
	 */
	error(message: string): void {
		this.log('ERROR', message);
		// Optionally show error to user
		// vscode.window.showErrorMessage(`Termetrix: ${message}`);
	}

	/**
	 * Logs a warning message (always logged, regardless of verbose setting).
	 * @param message - Warning message.
	 * @returns void
	 */
	warn(message: string): void {
		this.log('WARN', message);
	}

	/**
	 * Logs an info message (only logged if verbose mode is enabled).
	 * Use for performance metrics, scan results, and general debugging info.
	 * @param message - Info message.
	 * @returns void
	 */
	info(message: string): void {
		if (!this.isVerboseEnabled()) return;
		this.log('INFO', message);
	}

	/**
	 * Logs a debug message (only logged if verbose mode is enabled).
	 * Use for detailed debugging information.
	 * @param message - Debug message.
	 * @returns void
	 */
	debug(message: string): void {
		if (!this.isVerboseEnabled()) return;
		this.log('DEBUG', message);
	}

	/**
	 * Shows the Output Channel in the UI.
	 * Useful for directing users to logs when they report issues.
	 * @returns void
	 */
	show(): void {
		this.outputChannel?.show();
	}
}

/**
 * Singleton logger instance.
 */
export const logger = new Logger();
