# Termetrix

**Minimal VS Code productivity extension for project awareness**

Termetrix keeps a low-noise pulse on your project: disk usage, a quick directory breakdown, and a simple selection LOC counter — without heavy background watchers.

## Features

### Project Size (Status Bar)
- Shows project size in the status bar (`$(database)`)
- Shows a spinner while scanning and a warning icon if a scan was incomplete
- Click to open the Directory Navigator panel for more metrics

### Directory Navigator Panel (Webview)
- Two tabs: **Size** and **LOC**
- **Size**: click a row to reveal the folder in Explorer/Finder
- **LOC**: language breakdown + top files; click a file to open it in the editor (not inside the webview tab group)

### 🔢 Selection Line Counter
- Displays selected lines count when text is selected
- Updates in real-time as selection changes
- Minimal overhead, only shown when relevant

### Lines of Code (LOC)
- Counts non-empty lines in common source files
- Respects root `.gitignore` and skips common build/deps folders (like `node_modules`, `dist`, `.git`, `out`)
- Top 10 files by line count + per-language bars

### 🖥️ One-Click Terminal Access
- Dedicated terminal button in status bar
- Opens integrated terminal in active project
- Zero latency, zero logic

### ⚙️ Advanced Features
- **Multi-root support**: Automatically switches project context based on active file
- **Controlled concurrency**: 64 parallel filesystem operations (configurable)
- **Caching**: Keeps the latest scan result in memory for fast UI updates
- **Auto-refresh** (optional): Configurable interval scanning
- **Error resilience**: Permission errors don't fail entire scan
- **Cancellation support**: Cancel the VS Code progress notification or stop scans from the panel; switching roots cancels in-flight scans

## Status Bar Display

```
[Terminal] [Database] 18.2 GB [List] 142
```

- **Terminal icon** - Click to open integrated terminal
- **Database icon + size** - Project size (click to open Directory Navigator)
- **List icon + number** - Selected lines (shown only when text is selected)
- **Spinner icon** - Shown during scanning
- **Warning icon** - Incomplete scan indicator

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

## Commands

All commands are accessible via Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

- `Termetrix: Open Directory Navigator` - Open Directory Navigator panel
- `Termetrix: Refresh Project Scan` - Manually trigger project scan
- `Termetrix: Open Terminal` - Open integrated terminal

**Note:** No default keybindings are set to avoid conflicts. You can configure custom keybindings in VS Code settings.

## Performance

Termetrix is designed with performance as a first-class citizen:

- **Controlled concurrency**: Limits parallel filesystem operations (default: 64)
- **Soft limits**: Stops after 10 seconds or 50000 directories
- **Progress throttling**: Updates at most ~5x/sec during scans
- **In-memory cache**: Webview reuses the latest scan result (no extra scan needed)
- **Debouncing**: 200ms delay when switching between project roots

### Why No File System Watcher?

File system watchers are intentionally **not** used as primary scan triggers because:
1. **Event noise**: Large repos generate excessive events, causing unpredictable performance issues
2. **Cross-platform reliability**: Watchers can degrade or lose events on huge directory trees
3. **UX alignment**: Termetrix is an "awareness" tool, not real-time monitoring

## Technology

- **TypeScript**: Fully implemented in TypeScript (strict mode)
- **Preact**: Lightweight UI (~3KB runtime)
- **Lucide**: Icons via `lucide-preact`
- **esbuild**: Fast bundling for extension + webview
- **Node.js**: Native `fs/promises` API
- **Zero native dependencies**: Pure JavaScript/TypeScript

## Notes

- Disk usage scans are “real disk usage” and do not use `.gitignore`.
- LOC analysis respects the root `.gitignore` (nested `.gitignore` files are not currently parsed).

## Development

### Setup
```bash
pnpm install
```

### Build
```bash
pnpm run build
```

### Typecheck / Lint
```bash
pnpm run typecheck
pnpm run lint
```

### Test
Press **F5** in VS Code to launch Extension Development Host.

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or pull request.

---

**Made for developers who care about disk space and code quality**
