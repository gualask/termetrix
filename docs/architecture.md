# Termetrix Architecture

This repo is a **technical-driven** VS Code extension.

The core idea is to keep scanning/metrics logic **independent from VS Code**, and let the extension host layer wire it to VS Code UI (status bar + webview).

## High-level map

```
┌──────────────────────────────────────────────────────────────────────┐
│                              VS Code                                 │
│  commands • status bar • webview • workspace/editor events • output   │
└───────────────┬───────────────────────────────────────────────┬──────┘
                │                                               │
                │ messages (DTO)                                │ user actions
                ▼                                               ▼
┌───────────────────────────────┐                      ┌──────────────────────┐
│         src/extension/         │                      │       src/ui/        │
│  - entrypoint + wiring         │                      │ webview (Preact)     │
│  - VS Code adapters            │◀────── protocol ─────▶│ renders metrics       │
│  - host-side policy            │                      │ posts commands        │
└───────────────┬───────────────┘                      └──────────────────────┘
                │
                │ calls (ports) + returns results (DTO)
                ▼
┌───────────────────────────────┐
│           src/core/            │
│  pure scan/metrics engines     │
│  - size scan                   │
│  - LOC scan                    │
│  uses ports for FS + logging   │
└───────────────┬───────────────┘
                │
                │ implements ports
                ▼
┌───────────────────────────────┐
│        src/extension/          │
│  platform adapters (Node/FS)   │
└───────────────────────────────┘
```

## Directories (what goes where)

- `src/core/`
  - Pure engines and policies for scanning and metric computation.
  - Must not import VS Code.
  - Depends on ports (e.g. FS, logger) and on stable DTOs in `src/shared/contracts/`.

- `src/extension/`
  - VS Code extension host code: activation, commands, status bar items, webview panel orchestration.
  - **Allowed** to import `core/`, `shared/`, `protocol/` and use `vscode` APIs.
  - Structure:
    - `src/extension/extension.ts`: VS Code `activate()` entrypoint, service wiring.
    - `src/extension/vscode/`: code that directly depends on `vscode` (commands/status bar/webview/event wiring).
    - `src/extension/platform/`: Node/platform adapters that implement `core` ports (e.g. filesystem).
    - `src/extension/support/`: host-only utilities (logger, config, disposables, timers).

- `src/ui/`
  - Webview UI bundle (Preact).
  - Must not import `core/` or `extension/`.
  - Uses `src/protocol/` as the message/types surface.

- `src/protocol/`
  - Transport-level contract between extension host ↔ webview.
  - Message envelopes, command names, and re-exports of DTOs.

- `src/shared/`
  - Cross-layer stable utilities and DTOs.
  - `src/shared/contracts/` contains DTOs used across `core`, `extension`, `ui` and re-exported via `protocol`.

## Glossary (reduces naming drift)

- **Metrics Panel**: the webview UI that renders Size + LOC (implemented in `src/extension/vscode/metricsPanel/` + `src/ui/`).
- **Contracts**: stable DTOs shared across layers (`src/shared/contracts/`).
- **Protocol**: the extension ↔ webview transport surface (`src/protocol/types.ts`), which defines message envelopes and re-exports contract DTOs.

## Import rules of thumb (reduce cognitive load)

- Prefer `src/protocol/types.ts` for anything that crosses the extension ↔ webview boundary (message types, tabs, UI-facing DTOs).
  - UI re-exports via `src/ui/types.ts`.
  - Extension re-exports via `src/extension/types.ts`.
- Use `src/shared/contracts/` directly only when you need a shared **value** (not just a type) and it’s explicitly intended to be stable.
- Avoid importing `src/shared/contracts/*` from UI components “just because it’s there”; it makes it harder to see what is transport-facing vs internal.

## Data flow (runtime)

- Activation wires services in `src/extension/extension.ts`:
  - Status bar items subscribe to scanner events and render summary state.
  - Metrics panel (webview) is opened on demand; it sends commands and receives updates.

- Scans run in the extension host:
  - `core` engines do the scanning; `extension/platform` provides filesystem access; `extension/support` provides config and logging.
