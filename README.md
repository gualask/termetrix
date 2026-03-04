# Termetrix

[![CI](https://github.com/gualask/termetrix/actions/workflows/ci.yml/badge.svg)](https://github.com/gualask/termetrix/actions/workflows/ci.yml)
[![Version](https://img.shields.io/visual-studio-marketplace/v/gualask.termetrix)](https://marketplace.visualstudio.com/items?itemName=gualask.termetrix)

Minimal VS Code extension for project awareness: **project size**, **a guided size breakdown**, **LOC**, **selection line counter**, and a **terminal shortcut** — all from the status bar.

## Demo

![Termetrix demo](media/termetrix-demo.gif)

## Quickstart

1. Open a folder or workspace.
2. Click the project size item in the status bar to open the Metrics Panel.
3. Use `Termetrix: Refresh Project Scan` to rescan on demand.

## Status Bar

![Termetrix status bar](media/termetrix-statusbar.png)

| Item                 | Behavior                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| Terminal button      | Opens the integrated terminal. Can be hidden via settings.                                         |
| Project size         | Shows total project size. Click to open the Metrics Panel.                                         |
| Refresh / Cancel     | Refreshes the scan on click. Animates while scanning; click again to cancel.                       |
| Selection line count | Shows the number of selected lines. Visible only while selecting text. Can be hidden via settings. |

## Configuration

All settings are optional. Scan limits and auto-refresh are configurable via `termetrix.*` settings in VS Code.

Notable settings:

- `termetrix.statusBar.showTerminalButton` — show/hide the terminal button (default: `true`)
- `termetrix.statusBar.showSelectionLineCount` — show/hide the line counter (default: `true`)
- `termetrix.autoRefresh.enabled` — enable periodic background rescan (default: `false`)
- `termetrix.scan.maxDurationSeconds` — max scan duration before stopping (default: `10`)

## Commands

Available in the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Termetrix: Open Metrics Panel`
- `Termetrix: Refresh Project Scan`
- `Termetrix: Cancel Scan`
- `Termetrix: Open Terminal`

## Notes

- Project size is a **sum of file sizes** and does not filter by `.gitignore`.
- LOC respects the root `.gitignore` and skips common build/deps folders (nested `.gitignore` files are not parsed).
- Symlinks are not followed.
- No telemetry, no network requests.

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or pull request.

## Attribution

Insight icon created by [HAJICON](https://www.flaticon.com/authors/hajicon) from [Flaticon](https://www.flaticon.com/free-icons/insight)
