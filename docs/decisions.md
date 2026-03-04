# Termetrix Decisions (short)

Record only decisions that are easy to forget and expensive to rediscover during maintenance (bugfixes + dependency upgrades).

## Entry format (ADR-lite)

### <title>
- **Date**: YYYY-MM-DD
- **Why**: short rationale + trade-off
- **Revisit if**: what would change the decision
- **Code**: paths/symbols

## Decisions

### Scan limits exist and may yield “incomplete” results
- **Date**: 2026-02-14
- **Why**: bound worst-case traversal time/memory for large workspaces; surface partial results instead of hanging.
- **Revisit if**: we add persisted results or a background indexer.
- **Code**: `package.json` (settings defaults), `src/shared/contracts/sizeScanDefaults.ts`, `src/extension/support/configManager.ts`, `src/core/sizeScan/engine/scanLimits.policy.ts`

### Progress events are throttled
- **Date**: 2026-02-14
- **Why**: progress can be very frequent; throttling reduces UI churn and message overhead.
- **Revisit if**: we change the progress channel (e.g. cheaper rendering or batching).
- **Code**: `src/extension/support/constants.ts`, `src/extension/vscode/sizeScan/controller/scanEventEmitter.ts`

### LOC scan runs with lower concurrency than size scan
- **Date**: 2026-02-14
- **Why**: LOC requires reading files; keep it less aggressive than size traversal to reduce IO pressure.
- **Revisit if**: we add adaptive concurrency or different IO strategy.
- **Code**: `src/extension/vscode/locScan/locScanner.ts`, `src/core/locScan/locConfig.ts`

### Cancellation is best-effort; cancelled scans are not cached
- **Date**: 2026-02-14
- **Why**: avoid replacing last good values with partial/cancelled data; keep lifecycle stable.
- **Revisit if**: we want resumable scans or partial caching.
- **Code**: `src/extension/vscode/sizeScan/controller/scanRunner.ts`, `src/extension/vscode/sizeScan/services/scanLifecycleService.ts`

### Cache stores “public” scan results; heavy internals stay panel-local
- **Date**: 2026-02-14
- **Why**: keep memory bounded in long-lived VS Code sessions; webview-only internals are intentionally not persisted.
- **Revisit if**: users need deep breakdown instantly without re-scan.
- **Code**: `src/extension/vscode/sizeScan/state/scanCache.ts`, `src/extension/vscode/sizeScan/state/scanResultSanitizer.ts`, `src/extension/vscode/metricsPanel/state/metricsPanelSessionState.ts`

### Webview paths are treated as untrusted input (root containment enforced)
- **Date**: 2026-02-14
- **Why**: prevent the webview from requesting arbitrary filesystem paths outside the workspace root.
- **Revisit if**: we introduce workspace trust integration or a different message transport.
- **Code**: `src/extension/vscode/metricsPanel/commands/panelTargetPath.ts`, `src/extension/vscode/metricsPanel/commands/metricsPanelCommandUtils.ts`

### Webview uses strict CSP + nonce
- **Date**: 2026-02-14
- **Why**: reduce script/style injection surface; only allow bundled assets.
- **Revisit if**: webview needs external resources (should remain “no” by default).
- **Code**: `src/extension/vscode/metricsPanel/view/metricsPanelHtml.ts`

### Traversal rules differ: size scan ignores `.gitignore`, LOC respects `.gitignore` at all levels
- **Date**: 2026-02-14
- **Why**: size aims to reflect disk usage; LOC aims to reflect code and skip ignored folders/files. Nested `.gitignore` files are loaded and merged with parent rules at each directory level.
- **Revisit if**: we unify traversal policy.
- **Code**: `src/core/locScan/filtering/gitignore.ts`, `src/core/locScan/engine/locEngine.ts`, `src/core/sizeScan/engine/scanEngine.ts`

### Status bar favors low noise; panel owns “deep” interactions
- **Date**: 2026-02-14
- **Why**: status bar should be cheap to update and easy to read; details live in tooltip and metrics panel. A dedicated `$(sync)`/`$(sync~spin)` item provides refresh/cancel without opening the panel.
- **Revisit if**: we add more metrics (risk: clutter).
- **Code**: `src/extension/vscode/statusBar/metricsItem.ts`, `src/extension/vscode/statusBar/render/metricsStatusBarRenderer.ts`, `src/extension/vscode/statusBar/scanRefreshItem.ts`

### Refresh always runs a full scan
- **Date**: 2026-03-02
- **Why**: `$(sync)` always runs the full scan (including per-directory metrics). The previous split between `scanSummary()` (panel closed) and `scan()` (panel open) was removed to simplify the lifecycle — the overhead of collecting directory metrics is acceptable and avoids a two-tier scan model. The startup scan also runs full.
- **Revisit if**: scan becomes expensive enough that a fast summary path is needed again (e.g. very large monorepos); at that point reintroduce `scanSummary()` with persistent breakdown caching.
- **Code**: `src/extension/extension.ts` (`refreshScanCmd`, `runInitialScan`)

### Logging is quiet by default; verbose mode gates info/debug
- **Date**: 2026-02-14
- **Why**: avoid spamming the Output channel in normal usage; keep diagnostics available for troubleshooting.
- **Revisit if**: we introduce structured logging or telemetry (currently: none).
- **Code**: `src/extension/support/logger.ts`, `src/extension/support/configManager.ts`
