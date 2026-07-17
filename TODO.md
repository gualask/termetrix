# Termetrix - TODO & Future Improvements

## 🔄 Migration Roadmap

### ESM Migration (Waiting for VS Code 1.129+ Adoption)

**Context**: VS Code extensions historically had to use CommonJS. VS Code itself migrated to ESM in v1.94 (Oct 2024). ESM support for extensions was completed in July 2026 and ships with VS Code **1.129**.

**Tracking**:

- [microsoft/vscode#130367](https://github.com/microsoft/vscode/issues/130367) - Enable consuming of ES modules in extensions — **closed as completed on 2026-07-06, milestone 1.129.0**

**Decision (Jul 2026)**: too early to migrate. Adopting ESM requires raising `engines.vscode` to `^1.129.0`, cutting off users on older VS Code versions. Revisit once 1.129 is stable and a couple of releases old.

**Migration Checklist** (when we raise the minimum VS Code version to 1.129+):

- [ ] Update `package.json`: `"type": "commonjs"` → `"type": "module"`
- [ ] Update `engines.vscode` and `@types/vscode` to `^1.129.0`
- [ ] Update `tsconfig.json`: `"module": "NodeNext"` → `"module": "ESNext"` (or keep NodeNext)
- [ ] Rename output files if needed: `.js` extensions should work with ESM
- [ ] Update `main` field if VS Code requires `.mjs` extension
- [ ] Test with VS Code ESM runtime
- [ ] Update documentation (README, CHANGELOG)

---

## 🚀 Future Features

### Potential Enhancements

- [ ] .gitignore in size scan?
