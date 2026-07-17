# Changelog

All notable changes to the Termetrix extension will be documented in this file.
This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Improved LOC scan throughput with bounded parallel file processing and fewer unnecessary nested `.gitignore` reads
- Simplified size-scan lifecycle and caching so public results and directory metrics share one bounded cache entry
- Reorganized the LOC engine, status bar, metrics-panel state, and webview styles into cohesive behavior-preserving modules
- Migrated linting and formatting to Biome and upgraded project tooling dependencies
- Replaced numeric value-object classes with branded types and added a knip dead-code gate to the test chain
- Polished the webview toward a more native VS Code look: full-border warning/error banners, flatter size cards without drop shadows, and secondary text using the theme's `descriptionForeground` instead of opacity muting
- Progress bars now animate via `transform` instead of layout properties

### Fixed
- Tooltips are now reachable by keyboard and exposed to screen readers (focusable info trigger, `aria-describedby`, Esc to dismiss)
- Tooltips wrap instead of clipping in narrow panels, and language rows no longer overflow below ~330px width
- Collapse buttons expose `aria-expanded`, section headings use proper levels, and loading overlays block keyboard access to covered controls
- Corrected Sass LOC handling so `#` selectors and interpolation count as code while `//` lines count as comments
- Prevented escaped newlines and trailing backslashes from dropping physical lines during LOC counting
- Applied directory-only `.gitignore` patterns only to directories and their descendants, not same-named files
- Prevented a latent concurrent-queue deadlock when stopping with queued work and no items in flight
- Described failed filesystem entries as unreadable instead of permissions-only

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
