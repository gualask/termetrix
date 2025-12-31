
# Termetrix — Project Specification

## Vision
Termetrix is a VS Code productivity extension that unifies common developer utilities into a minimal, low-noise status bar experience.
The goal is to increase real-time awareness of the workspace state (disk usage, code metrics, workflow access) without clutter or performance degradation.

---

## Target User
- Primary: the author (real-world driven design)
- Profile:
  - Works on multi-language projects
  - Handles medium-to-large repositories
  - Often deals with disk-heavy directories (node_modules, target, caches, builds)
- Stack-agnostic (not tied to Rust, Node, Python, etc.)

---

## Core Principles
- One extension, minimal status bar footprint
- Performance-first (gentle scanning, soft limits)
- Information appears only when useful
- No heavy analytics, only actionable awareness
- Fully implemented in TypeScript (no native modules)

---

## Status Bar Design

### Elements

#### 1. Terminal Item
- Icon-only status bar item (`$(terminal)`)
- Always visible (priority 1000)
- Single click opens the integrated terminal
- Zero latency, zero logic

#### 2. Metrics Item
- Displays (priority 999):
  - Workspace size (always visible)
  - Selected lines count (only when selection is non-empty)
  - Spinner icon during scanning
  - Warning icon for incomplete scans
- Examples:
  - `$(database) 18.2 GB`
  - `$(database) 18.2 GB $(list-selection) 142`
  - `$(database) 12.4 GB $(loading~spin)` (scanning)
  - `$(database) 18.2 GB $(warning)` (incomplete)

---

## Workspace Scope

### Root Selection
- The monitored root is always the root folder of the **currently active file**
- In multi-root workspaces:
  - Only the active folder is scanned
  - No global workspace aggregation
  - Rapid switching between roots triggers debounced scan (200ms default) with automatic cancellation of previous scan
- If no file is active, last known root is retained
- Empty workspace or non-existent root: status bar shows `📦 —`

### What Is Measured
- Directory sizes calculated as recursive sum of all file bytes under that directory
- Individual file sizes are not surfaced in the UI
- Includes hidden files (`.git`, `.DS_Store`, etc.) by default
- Symlinks are ignored (not followed) to avoid cycles and duplicate counting

---

## Directory Analysis

### Strategy
- Scan all directories recursively
- Identify **Top 10 heaviest directories at any depth** for Quick Pick navigation
- Track **Top 3** for tooltip and persistent snapshots
- No default exclusions (node_modules, target, etc. are intentionally included to surface real disk usage)

### Output
- Top 10: Quick Pick navigation
- Top 3: Tooltip summary and daily snapshots

---

## Tooltip (Metrics Item)

The tooltip provides dense but non-intrusive information.

### Contents
- Total workspace size
- Growth over last 7 days
- Mini sparkline (7-day trend)
- Top 3 heaviest directories
- Scan metadata (duration, timestamp)
- Partial scan warnings (if applicable)

### Example
```
Workspace size: 18.2 GB
Growth (7d): +3.1 GB
Trend: ▁▂▃▄▆▇█

Top folders:
- node_modules/.pnpm → 7.2 GB
- target/debug → 5.9 GB
- .cache → 1.8 GB

Last scan: 1m ago (1.4s)
```

If incomplete or errors occurred:
```
⚠ Scan incomplete (stopped after 3s / 5000 dirs)
⚠ 12 directories skipped (permission denied)
```

---

## Click Interaction (Metrics Item)

### Directory Navigator Panel
- Click opens a webview panel beside the active editor
- Two tabs: **Size** (directory analysis) and **LOC** (lines of code)

### Size Tab
- Displays Top 10 heaviest directories globally (any depth)
- Current level subdirectories with size and percentage bars
- Stack-based navigation:
  - Breadcrumb trail shows current path
  - Clicking a directory drills down to its subdirectories
  - Back button pops stack and returns to previous level
  - Home button returns to root
- Context menu (right-click) on any directory:
  - Reveal in Explorer
  - Open Terminal in directory
  - Copy full path
- Refresh button triggers manual rescan
- Cancel button stops in-progress scans

### LOC Tab
- Calculates lines of code across workspace source files
- Purpose: Identify "stale" or oversized files that need refactoring
- Displays:
  - Total lines of code
  - Breakdown by programming language (with visual bars)
  - Top 10 files by line count
  - Scanned/skipped file statistics
- Supported languages: TypeScript, JavaScript, Python, Go, Rust, Java, C/C++, C#, Ruby, PHP, Swift, Vue, Svelte, CSS, HTML, SQL, Shell
- Excludes: node_modules, .git, dist, out, build, coverage
- Skips files larger than 2MB

---

## Scan Triggers

### Default Behavior
- Scan at extension startup
- Manual scan via Quick Pick / command

### Optional Auto-Refresh
Disabled by default.

Behavior when enabled:
- Triggers only if VS Code is active
- Skipped if a scan is already in progress
- Does not use file system watchers (see Technical Architecture)

Settings:
- `termetrix.autoRefresh.enabled`
- `termetrix.autoRefresh.minutes`

---

## Performance & Safety

### Soft Limits (Configurable)
Scanning stops when either condition is met:
- Maximum scan duration (default: 10 seconds)
- Maximum number of directories processed (default: 50,000)

### Concurrent Operations
- Controlled concurrency via semaphore (default: 64 parallel filesystem operations)
- Prevents saturation of filesystem/CPU on large repos

### Error Handling
- Permission errors (EACCES): directories are skipped and tracked, scan continues
- Skipped directories shown in tooltip and Quick Pick with count

Settings:
```json
{
  "termetrix.scan.maxDurationSeconds": 10,
  "termetrix.scan.maxDirectories": 50000,
  "termetrix.scan.concurrentOperations": 64,
  "termetrix.scan.rootSwitchDebounceMs": 200
}
```

### Partial Results UX
- Status bar indicator (`*`) for incomplete scans
- Tooltip warning (time limit, directory limit, skipped count)
- Quick Pick warning entry
- No intrusive notifications

---

## Caching Strategy

### In-Memory Cache
- Active scan results
- Quick Pick navigation
- Prevents redundant scans in-session

### Persistent Cache (globalState)
Stored per root (each workspace root has independent snapshots):
- Snapshot format: `{ date, totalBytes, top3: [{ path, bytes }] }`
- Daily snapshots (max 7, ring buffer)
- Snapshot created: at first **completed** scan of the day (incomplete/cancelled scans are not persisted as daily snapshots)
- Used for 7-day trend calculation and tooltip immediate display

---

## Trend Tracking

### Model
- One snapshot per day
- Ring buffer of 7 entries
- Growth computed as:
```
current_size - size_7_days_ago
```

### Visualization
- Unicode sparkline (▁▂▃▄▅▆▇█)
- Displayed in tooltip

---

## Technical Architecture

### Project Structure
```
src/
├── extension/          # VS Code extension (Node.js)
│   ├── cache/          # Scan caching & persistence
│   ├── scanner/        # Workspace & LOC scanning
│   ├── services/       # Directory operations
│   ├── statusBar/      # Status bar UI elements
│   ├── webview/        # Webview panel orchestration
│   ├── utils/          # Formatting utilities
│   └── extension.ts    # Entry point
├── shared/             # Shared types & utilities
│   ├── types.ts        # Common type definitions
│   └── formatters.ts   # Shared formatters
└── ui/                 # Preact webview
    ├── components/     # TSX components
    ├── styles.css      # Webview styles
    └── main.tsx        # Entry point
```

### Tech Stack
- **Extension**: TypeScript, Node.js `fs/promises`
- **UI**: Preact + JSX (~25KB bundle)
- **Build**: esbuild with JSX support
- **No native dependencies**: Pure TypeScript/JavaScript

### Directory Scanning Algorithm
- Uses `fs.readdir()` with BFS queue
- Controlled concurrency via semaphore (default: 64 parallel operations)
- Min-heap data structure for tracking Top N directories efficiently
- Each iteration checks: cancellation token, time limit, directory limit
- File sizes retrieved via `fs.stat()` and summed recursively per directory

### LOC Scanning Algorithm
- Uses `fs.opendir()` for memory-efficient streaming
- Counts non-empty lines via character code scanning (optimized)
- Tracks top 10 files by line count
- Excludes common build/cache directories

### Cancellation & Interruption
- Supports VS Code `CancellationToken`
- Automatic cancellation of previous scan when new scan is triggered (root switch, manual refresh)
- On cancellation: stops enqueuing new jobs, waits for in-flight operations, returns partial results
- Partial results always marked with `incomplete: true` and reason (`cancelled`, `time_limit`, `dir_limit`)

### Why No File System Watcher?
File system watchers are **not** used as primary scan triggers for three reasons:
1. **Event noise**: Large repos (node_modules, target, caches) generate excessive events, causing unpredictable performance degradation
2. **Cross-platform reliability**: Watchers on huge directory trees can degrade or lose events (OS limits, different filesystems, remote scenarios)
3. **UX alignment**: Termetrix is an "awareness" tool, not real-time monitoring. Controlled scans (startup + manual + optional timed refresh) align better with the non-invasive design principle

### Commands
All functionality is exposed via commands (no default keybindings):
- `termetrix.openScanPanel` — Opens the Directory Navigator panel (triggered by click on Metrics status bar item)
- `termetrix.refreshScan` — Manual rescan (triggered from the panel action / command palette)
- `termetrix.openTerminal` — Opens integrated terminal (triggered by click on Terminal status bar item)

---

## Settings Summary

| Setting | Default | Description |
|------|------|------|
| termetrix.autoRefresh.enabled | false | Enable auto-refresh |
| termetrix.autoRefresh.minutes | 10 | Refresh interval (minutes) |
| termetrix.scan.maxDurationSeconds | 10 | Scan time limit (seconds) |
| termetrix.scan.maxDirectories | 50000 | Directory count limit |
| termetrix.scan.concurrentOperations | 64 | Parallel filesystem operations |
| termetrix.scan.rootSwitchDebounceMs | 200 | Debounce for multi-root switching (ms) |
| termetrix.ui.showTrend | true | Show 7-day growth in tooltip |

---

## Roadmap

### v0.1 (Completed)
- Dual status bar items
- Workspace size calculation
- Selected lines counter
- Terminal one-click access
- Directory navigator panel (webview)
- Soft limits and RAM cache

### v0.2 (Current)
- Persistent snapshots
- 7-day growth tracking
- Sparkline visualization
- Full settings support
- LOC analysis tab (identify oversized files)
- Preact UI (~25KB bundle)

### v1.0 (Planned)
- Unit test coverage
- Stability and performance polish
- Marketplace-ready documentation

---

## Why This Works
- Reduces status bar clutter
- Measures real disk usage instead of hiding it
- Identifies code hotspots (oversized files) for refactoring
- Performance-conscious by design
- Minimal mental overhead
- Evolves without becoming analytics-heavy
