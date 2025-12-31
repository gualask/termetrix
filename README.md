# Termetrix

**Minimal VS Code productivity extension for workspace awareness**

Termetrix unifies common developer utilities into a minimal, low-noise status bar experience. Stay aware of workspace disk usage, code selection metrics, and workflow access without clutter or performance degradation.

## Features

### 📊 Workspace Size Monitoring
- Real-time workspace size calculation displayed in status bar
- Recursive directory scanning with performance-first design
- Soft limits (10s, 50000 directories) prevent performance degradation
- Top 10 heaviest directories tracked at any depth
- Includes `node_modules`, `target`, and other typically hidden directories

### 📈 7-Day Growth Tracking
- Daily snapshots automatically saved
- Visual trend with Unicode sparkline (▁▂▃▄▅▆▇█)
- Growth calculation over last 7 days
- All data stored per workspace root

### 🔢 Selection Line Counter
- Displays selected lines count when text is selected
- Updates in real-time as selection changes
- Minimal overhead, only shown when relevant

### 📂 Directory Navigator Panel
- Webview panel with two tabs: **Size** and **LOC**
- Top 10 heaviest directories (any depth) + current level subdirectories
- Breadcrumb navigation with Back/Home buttons
- Right-click context menu:
  - Reveal in Explorer
  - Open Terminal
  - Copy full path

### 📝 Lines of Code Analysis
- Identify oversized files that need refactoring
- Breakdown by programming language with visual bars
- Top 10 files by line count
- Supports 20+ languages (TypeScript, Python, Rust, Go, Java, etc.)
- Excludes build artifacts (node_modules, dist, .git)

### 🖥️ One-Click Terminal Access
- Dedicated terminal button in status bar
- Opens integrated terminal in active workspace
- Zero latency, zero logic

### ⚙️ Advanced Features
- **Multi-root workspace support**: Automatically switches context based on active file
- **Controlled concurrency**: 64 parallel filesystem operations (configurable)
- **Smart caching**: In-memory + persistent (globalState) cache
- **Auto-refresh** (optional): Configurable interval scanning
- **Error resilience**: Permission errors don't fail entire scan
- **Cancellation support**: Stop scans with Ctrl+C or by switching roots

## Status Bar Display

```
[Terminal] [Database] 18.2 GB [List] 142
```

- **Terminal icon** - Click to open integrated terminal
- **Database icon + size** - Workspace size (click to open Directory Navigator)
- **List icon + number** - Selected lines (shown only when text is selected)
- **Spinner icon** - Shown during scanning
- **Warning icon** - Incomplete scan indicator

## Tooltip Information

Hover over the workspace size to see:
- Total workspace size
- 7-day growth (`+3.1 GB`)
- Visual trend sparkline
- Top 3 heaviest directories
- Last scan time and duration
- Warnings (incomplete scan, permission errors)

**Example:**
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

## Configuration

All settings are optional and have sensible defaults.

### Auto-Refresh
```json
{
  "termetrix.autoRefresh.enabled": false,
  "termetrix.autoRefresh.minutes": 10
}
```

### Scan Limits
```json
{
  "termetrix.scan.maxDurationSeconds": 10,
  "termetrix.scan.maxDirectories": 50000,
  "termetrix.scan.concurrentOperations": 64,
  "termetrix.scan.rootSwitchDebounceMs": 200
}
```

### UI
```json
{
  "termetrix.ui.showTrend": true
}
```

## Commands

All commands are accessible via Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

- `Termetrix: Open Directory Navigator` - Open Directory Navigator panel
- `Termetrix: Refresh Workspace Scan` - Manually trigger workspace scan
- `Termetrix: Open Terminal` - Open integrated terminal

**Note:** No default keybindings are set to avoid conflicts. You can configure custom keybindings in VS Code settings.

## Performance

Termetrix is designed with performance as a first-class citizen:

- **Streaming**: Uses `fs.promises.opendir()` to avoid loading entire directories into memory
- **Controlled concurrency**: Semaphore limits parallel operations (default: 64)
- **Soft limits**: Stops after 10 seconds or 50000 directories
- **Min-heap**: Efficiently tracks Top N directories
- **Smart caching**: Avoids redundant scans
- **Debouncing**: 200ms delay when switching between workspace roots

### Why No File System Watcher?

File system watchers are intentionally **not** used as primary scan triggers because:
1. **Event noise**: Large repos generate excessive events, causing unpredictable performance issues
2. **Cross-platform reliability**: Watchers can degrade or lose events on huge directory trees
3. **UX alignment**: Termetrix is an "awareness" tool, not real-time monitoring

## Technology

- **TypeScript**: Fully implemented in TypeScript (strict mode)
- **Preact**: Lightweight UI (~3KB runtime)
- **esbuild**: Fast bundling with JSX support
- **Node.js**: Native `fs/promises` API
- **Zero native dependencies**: Pure JavaScript/TypeScript

## Roadmap

### ✅ v0.2 (Current)
- Persistent snapshots
- 7-day growth tracking
- Sparkline visualization
- Full settings support
- Auto-refresh (optional)
- LOC analysis tab
- Preact webview UI (~25KB bundle)

### 🚀 v1.0 (Planned)
- Unit test coverage
- Stability and performance polish
- Marketplace-ready documentation

## Development

### Setup
```bash
pnpm install
```

### Build
```bash
pnpm run build
```

### Test
Press **F5** in VS Code to launch Extension Development Host.

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or pull request.

---

**Made with ❤️ for developers who care about disk space and code quality**
