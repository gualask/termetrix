# Product

## Register

product

## Users
Developers working inside VS Code who want a quick read on their project's footprint: how big it is on disk, where the weight is concentrated, and how much code it contains by language. They open the Termetrix panel occasionally (not a permanently-docked dashboard), glance, maybe drill into a heavy directory or a top file, and close it. Context: any VS Code theme (light/dark/high-contrast), any project size from toy repo to monorepo.

## Product Purpose
Termetrix surfaces project size and LOC metrics in a webview panel and the status bar. Success = the user gets trustworthy numbers at a glance, understands scan state (running / incomplete / stale) without reading docs, and can act on rows (reveal in explorer, open file) frictionlessly.

## Brand Personality
Native, quiet, trustworthy. The panel should feel like a built-in VS Code view — indistinguishable in tone from the editor's own UI. Zero self-branding; the numbers are the interface.

## Anti-references
- Overloaded IDE panels (2000s-era): dense toolbars, icon forests, borders everywhere, controls competing with data.
- SaaS analytics dashboards: gradient cards, hero metrics, decorative chrome.

## Design Principles
1. **Blend in, don't brand.** Use VS Code theme tokens for every color; the panel must look native in any theme, including high contrast.
2. **Numbers first.** Metrics are the content; chrome exists only to contextualize them (state, freshness, incompleteness).
3. **State is always legible.** Scanning, cancelled, incomplete, stale — every state has a visible, plain-language representation.
4. **One action per row, obvious.** Rows that act (reveal, open) look actionable; nothing else competes.
5. **Degrade gracefully.** No workspace, empty scan, permission-denied: every empty/error state guides the next step.

## Accessibility & Inclusion
WCAG AA target: contrast ≥4.5:1 for body text (≥3:1 large text) in light, dark, and high-contrast themes; full keyboard operability; screen-reader-sensible roles/labels; respect prefers-reduced-motion.
