# Termetrix - TODO & Future Improvements

## 🔄 Migration Roadmap

### ESM Migration (When VS Code Supports It)

**Context**: As of 2025, VS Code extensions MUST use CommonJS. VS Code itself migrated to ESM in v1.94 (Oct 2024), but extension support is not yet available.

**Tracking Issues**:
- [microsoft/vscode#130367](https://github.com/microsoft/vscode/issues/130367) - Enable consuming of ES modules in extensions
- [microsoft/vscode#135450](https://github.com/microsoft/vscode/issues/135450) - Explore enabling ESM based extensions

**Migration Checklist** (when ESM support lands):
- [ ] Update `package.json`: `"type": "commonjs"` → `"type": "module"`
- [ ] Update `tsconfig.json`: `"module": "NodeNext"` → `"module": "ESNext"` (or keep NodeNext)
- [ ] Rename output files if needed: `.js` extensions should work with ESM
- [ ] Update `main` field if VS Code requires `.mjs` extension
- [ ] Test with VS Code ESM runtime
- [ ] Update documentation (README, CHANGELOG)

**Benefits of ESM**:
- Tree-shaking with esbuild/rollup (smaller bundle size)
- Better performance (native module loading)
- Modern JavaScript standard
- Better tooling support

---

## 🚀 Future Features (v1.0+)

### Potential Enhancements
- [ ] Export workspace size data (CSV, JSON formats)
- [ ] Exclude patterns configuration (via settings)
- [ ] Follow symlinks option (with loop protection)
- [ ] Smart refresh using file system watchers (limited scope)
- [ ] Custom sparkline characters/styles
- [ ] Workspace size alerts/notifications (threshold-based)
- [ ] Compare workspace sizes across time
- [ ] Integration with .gitignore patterns

### Performance Optimizations
- [ ] Worker threads for large scans
- [ ] Incremental scanning (only changed directories)
- [ ] Better caching strategies
- [ ] Compressed snapshot storage

### UX Improvements
- [ ] Extension icon (128x128)
- [ ] Marketplace screenshots
- [ ] GIF demos in README
- [ ] Guided size breakdown (others + file composition insights)
- [ ] Interactive tutorial on first install
- [ ] Keyboard shortcuts (optional, user-configurable)

---

## 📝 Code Quality

### Technical Debt
- [ ] Add comprehensive unit tests
- [ ] Add integration tests
- [ ] E2E tests with @vscode/test-electron
- [ ] Performance benchmarks
- [ ] Memory profiling

### Documentation
- [ ] API documentation (TypeDoc)
- [ ] Architecture diagram
- [ ] Contributing guidelines
- [ ] Code of Conduct

---

## 🐛 Known Issues

_None currently tracked_

---

**Last Updated**: 2025-12-28
