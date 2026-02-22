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

---

## 🚀 Future Features (v1.0+)

### Potential Enhancements

- [ ] .gitignore in size scan?
