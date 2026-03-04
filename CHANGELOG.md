# Changelog

All notable changes to the Termetrix extension will be documented in this file.
This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-04

### Added
- LOC analysis with comment stripping (per-language, top files)
- Auto-scan LOC on panel open (`termetrix.panel.autoScanLoc` setting)
- Relative scan age label in Size section ("just now", "X min ago")
- `termetrix.scan.autoScanMode` setting to control when auto-scans trigger
- `termetrix.scan.maxDirectories` limit with partial results

### Changed
- UI overhauled: single-page layout (LOC + Size), no tabs
- Size breakdown loads automatically after scan (no user action needed)

### Fixed
- Scan errors were silently treated as cancellations
- `cancelScan` side effects and stale LOC result on workspace root change
- Error banner now floats as toast

## [1.0.0] - 2026-02-22

### Added
- Project size in the status bar with guided size breakdown
- LOC analysis per-language with top files
- Metrics Panel (webview) with Size and LOC tabs
- Selection line counter
- Optional one-click terminal button
- Multi-root workspace support
- Cancellable scans with configurable limits
- Auto-refresh support
- Strict CSP, no telemetry, no network requests
