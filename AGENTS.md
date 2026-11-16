# ABSOLUTE PROJECT RULE

THIS PROJECT IS A NATIVE DESKTOP APPLICATION.

The final UI must be JavaFX. Do not implement React, Electron, Tauri, a PWA, WebView, HTML/CSS as application UI, browser-based screens, URL routing, or localhost as the user interface.

The user must be able to install and launch the product as a Windows desktop application. The legacy Expo/React/Electron code is a migration reference only until the JavaFX version replaces each verified flow.

## Financial rules

- Use `BigDecimal` for monetary values; never `double` or `float`.
- Persist a payment separately from its `PaymentAllocation` records.
- Do not invent delinquency rules. Keep its calculator/configuration abstract until the business provides the formula.
- All financial writes must be transactional, auditable, authorized and idempotent.
- Closed settlements are immutable; use auditable corrections instead of silent edits/deletes.

## GitHub Spec Kit Workflow (SDD, Bugfix & Assessment)

This repository uses **[GitHub Spec Kit (`github/spec-kit`)](https://github.com/github/spec-kit)** in `.specify/` and `.agents/skills/speckit-*`:

- **Project Constitution**: `.specify/memory/constitution.md` (`/speckit-constitution`).
- **New Features / Structural Changes (SDD)**: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` → `/speckit-converge`.
- **Bug Fixing**: `/speckit-bug-assess` → `/speckit-bug-fix` → `/speckit-bug-test` (artifacts in `.specify/bugs/<slug>/`).
- **Idea Assessment**: `/speckit-assess-intake` → `research` → `define` → `shape` → `decide` (artifacts in `.specify/assessments/<slug>/`).

