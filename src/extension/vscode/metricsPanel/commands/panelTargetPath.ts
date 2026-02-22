import { ScanRoot } from '../../../../core/shared/pathing/scanRoot';

function isValidPanelTargetPathInput(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/**
 * Parses and validates a raw path coming from webview messages.
 * @param value - Unknown path payload.
 * @returns Validated path, or undefined when invalid.
 */
export function parsePanelTargetPath(value: unknown): string | undefined {
	if (!isValidPanelTargetPathInput(value)) return undefined;
	// Note: the string can be absolute or root-relative; containment is enforced by `resolvePanelTargetPath`.
	return value;
}

/**
 * Resolves a panel target path and enforces workspace-root containment.
 * @param rootPath - Current workspace root.
 * @param targetPath - Path parsed from the message.
 * @returns Absolute path within root, or undefined when invalid/outside root.
 */
export function resolvePanelTargetPath(rootPath: string, targetPath: string): string | undefined {
	const root = ScanRoot.fromPath(rootPath);
	if (!root) return undefined;
	return root.resolvePathIfWithinRoot(targetPath);
}
