---
title: "Phase 6: Infrastructure & Polish"
description: "Testing, CI/CD, error tracking, dark mode, backup/export, and PWA support for production readiness"
status: pending
priority: P2
effort: 18h
branch: main
tags: [infrastructure, testing, ci-cd, dark-mode, pwa, polish]
created: 2026-06-03
---

# Phase 6: Infrastructure & Polish

## Overview

Production-hardening of Agentic Inbox: unit/integration tests, CI/CD pipeline, structured error logging, dark mode, email backup/export, and PWA support. Keyboard shortcuts are **already complete** and excluded.

## Phase Ordering & Dependencies

```
Phase 01 (Tests)         ─┐
Phase 02 (CI/CD)         ─┤── Phase 02 depends on Phase 01 (tests must exist for CI)
Phase 03 (Error Logging) ─┤── Independent
Phase 04 (Dark Mode)     ─┤── Independent
Phase 05 (Backup/Export) ─┤── Independent
Phase 06 (PWA)           ─┘── Independent (but benefits from dark mode for manifest)
```

## Phases

| # | Phase | Status | Effort | Files Modified/Created |
|---|-------|--------|--------|----------------------|
| 01 | [Unit & Integration Tests](./phase-01-unit-integration-tests.md) | pending | 6h | vitest config, test files, package.json |
| 02 | [CI/CD Pipeline](./phase-02-ci-cd-pipeline.md) | pending | 2h | .github/workflows/ci.yml, package.json |
| 03 | [Structured Error Logging](./phase-03-structured-error-logging.md) | pending | 2h | workers/lib/logger.ts, workers files |
| 04 | [Dark Mode](./phase-04-dark-mode.md) | pending | 3h | app/root.tsx, app/hooks/useThemeStore.ts, app/components/Header.tsx, app/index.css |
| 05 | [Backup & Export](./phase-05-backup-export.md) | pending | 3h | workers/index.ts, workers/lib/backup-export.ts |
| 06 | [PWA Support](./phase-06-pwa-support.md) | pending | 2h | public/manifest.json, public/service-worker.js, app/root.tsx |

## Key Dependencies

- **Vitest**: needs `@cloudflare/vitest-pool-workers` for Workers runtime compat
- **CI/CD**: depends on tests existing (Phase 01)
- **Dark mode**: uses kumo's `data-mode` attribute on `<html>` -- no `dark:` variants needed
- **PWA**: service worker must respect Cloudflare Access JWT (no offline for authenticated requests)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Vitest + CF Workers runtime incompatibility | Medium | High | Use `@cloudflare/vitest-pool-workers`; test pure functions first |
| Kumo components not rendering correctly in dark mode | Low | Medium | Kumo uses CSS `light-dark()` natively; only custom styles need attention |
| Service worker intercepting API/auth requests | Medium | High | SW only caches GET requests to static/email routes; bypass `/api/*`, CF Access |
| CI deploy secrets misconfigured | Low | Medium | Use GitHub environment secrets; test with `--dry-run` first |

## Out of Scope

- Keyboard shortcuts (already complete: `app/hooks/useKeyboardShortcuts.ts`, `app/components/ShortcutsHelpModal.tsx`)
- E2E tests with Playwright (defer to future phase -- requires running CF Workers locally)
- Sentry integration (YAGNI -- Cloudflare Logpush is sufficient for now)
- Linter setup (no eslint/biome currently configured; separate concern)

## Success Criteria

1. `npm test` runs Vitest suite, 70%+ coverage on `workers/lib/` and `shared/`
2. GitHub Actions CI: typecheck + test on PR, deploy on main push
3. All `console.error` calls replaced with structured logger in workers/
4. Dark mode toggle in header, persists via localStorage, respects system preference
5. `/api/v1/mailboxes/:id/export` endpoint produces valid EML bundle
6. PWA installable on mobile with offline reading of cached emails
