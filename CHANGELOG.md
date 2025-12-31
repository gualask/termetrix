# Changelog

All notable changes to the Termetrix extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-12-28

### Added
- **7-day growth tracking**: Automatic daily snapshots with growth calculation
- **Sparkline visualization**: Unicode sparkline (▁▂▃▄▅▆▇█) in tooltip showing 7-day trend
- **Auto-refresh**: Optional configurable auto-refresh (disabled by default)
  - `termetrix.autoRefresh.enabled` setting
  - `termetrix.autoRefresh.minutes` setting (default: 10 minutes)
- **Persistent cache**: Daily snapshots stored in VS Code globalState
  - Ring buffer of 7 snapshots per workspace root
  - Includes top 3 directories for quick tooltip display
- **Configuration watching**: Auto-refresh responds to settings changes in real-time

### Improved
- Enhanced tooltip with growth information and sparkline
- Better scanner lifecycle management with proper disposal
- Auto-refresh only triggers when VS Code is active and no scan is in progress

## [0.1.0] - 2025-12-28

### Added
- **Initial release** (MVP)
- **Dual status bar items**:
  - Terminal button for one-click terminal access
  - Metrics display showing workspace size and selected line count
- **Workspace size calculation**:
  - Recursive directory scanning with `fs.promises.opendir()`
  - Controlled concurrency (64 parallel operations)
  - Min-heap for tracking Top 10 directories
  - Soft limits: 3 seconds duration, 5000 directories
- **Selected LOC counter**: Shows selected lines when text is selected
- **Quick Pick navigation**:
  - Recursive navigation through directories
  - Top 10 subdirectories per level
  - Stack-based navigation with Back button
  - Actions: Reveal in Explorer, Open Terminal, Copy Path, Refresh
- **Multi-root workspace support**:
  - Automatic root switching based on active file
  - Debounced scanning (200ms) to prevent thrashing
  - Automatic cancellation of previous scans
- **Error resilience**:
  - Permission errors (EACCES) don't fail entire scan
  - Skipped directories are tracked and reported
  - Incomplete scan indicators (`*` in status bar, warnings in tooltip and Quick Pick)
- **Caching**:
  - In-memory cache for scan results
  - Prevents redundant scans within session
- **Configuration**:
  - `termetrix.scan.maxDurationSeconds` (default: 3)
  - `termetrix.scan.maxDirectories` (default: 5000)
  - `termetrix.scan.concurrentOperations` (default: 64)
  - `termetrix.scan.rootSwitchDebounceMs` (default: 200)
  - `termetrix.ui.showTrend` (default: true)
- **Commands**:
  - `termetrix.openQuickPick` - Open directory navigator
  - `termetrix.refreshScan` - Manually refresh workspace scan
  - `termetrix.openTerminal` - Open integrated terminal

### Technical Details
- TypeScript implementation with strict mode
- Node.js `fs/promises` API for filesystem operations
- Semaphore pattern for controlled concurrency
- Min-heap data structure for efficient Top N tracking
- VS Code CancellationToken support for scan interruption

## [Unreleased]

### Migration Watch: ESM Support

**Note**: Currently using CommonJS (required by VS Code extensions). VS Code itself migrated to ESM in v1.94 (Oct 2024), but extension support is pending. Tracking:
- [microsoft/vscode#130367](https://github.com/microsoft/vscode/issues/130367)
- [microsoft/vscode#135450](https://github.com/microsoft/vscode/issues/135450)

When ESM support lands, migrate from `"type": "commonjs"` to `"type": "module"`. See `TODO.md` for full migration checklist.

### Planned for v1.0
- Stability and performance polish
- Enhanced marketplace documentation
- Additional export formats (CSV, JSON)
- Improved error reporting and diagnostics
- Comprehensive test suite
- Potential features:
  - Exclude patterns (configurable)
  - Follow symlinks (configurable with loop protection)
  - Smart refresh using file system watchers (limited scope)
