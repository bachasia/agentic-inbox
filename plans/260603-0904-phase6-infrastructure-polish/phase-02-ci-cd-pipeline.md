# Phase 02: CI/CD Pipeline

## Context Links
- [Plan overview](./plan.md)
- [Phase 01: Tests](./phase-01-unit-integration-tests.md) (blocker)
- [Wrangler deploy docs](https://developers.cloudflare.com/workers/wrangler/commands/#deploy)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 2h
- **Description:** GitHub Actions workflow for typecheck + test on PRs, deploy on main push. Simple, KISS -- one workflow file.
- **Blocker:** Phase 01 must be complete (tests must exist for CI to run them)

## Key Insights
- No `.github/` directory exists yet
- Existing `package.json` scripts: `build`, `dev`, `deploy` (`npm run build && wrangler deploy`), `typecheck` (`npm run cf-typegen && react-router typegen && tsc -b`)
- `cf-typegen` runs `wrangler types` which generates `worker-configuration.d.ts` -- needed before typecheck
- Wrangler deploy requires `CLOUDFLARE_API_TOKEN` secret
- No linter configured -- skip lint step (YAGNI)
- `wrangler.jsonc` has `"name": "agentic-inbox"` -- deploy target

## Requirements

### Functional
- PR workflow: typecheck + test on every PR and push to non-main branches
- Deploy workflow: typecheck + test + deploy on push to main
- Preview deploys on PR (optional nice-to-have via `wrangler deploy --env preview`)

### Non-Functional
- CI completes in <5 min
- Secrets never logged or exposed
- Cache node_modules for speed

## Architecture

### Workflow Design
Single file `.github/workflows/ci.yml` with two jobs:

```
PR push / main push
  ↓
[check] job (runs always)
  ├── checkout
  ├── setup node 22 + cache
  ├── npm ci
  ├── npm run typecheck
  └── npm test
  ↓ (on main only)
[deploy] job (needs: check)
  ├── checkout
  ├── setup node 22 + cache
  ├── npm ci
  ├── npm run build
  └── wrangler deploy
```

### Data Flow
```
GitHub PR → triggers "check" job → typecheck + test → report status
GitHub push to main → triggers "check" → "deploy" → wrangler → Cloudflare
```

## Related Code Files

### Files to Read
| File | Why |
|------|-----|
| `package.json:16-22` | Existing scripts to call in CI |
| `wrangler.jsonc:2` | Worker name for deploy target |
| `tsconfig.json` | Understand typecheck chain |

### Files to Create
| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | CI/CD workflow |

### Files to Modify
None -- workflow is self-contained.

## Implementation Steps

### Step 1: Create workflow directory
```bash
mkdir -p .github/workflows
```

### Step 2: Create `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test

  deploy:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: check
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Step 3: Configure GitHub repository secrets
Document in PR description that `CLOUDFLARE_API_TOKEN` must be set in repo Settings > Secrets as a repository secret or in a "production" environment.

### Step 4: Test locally
```bash
# Verify scripts work before pushing
npm run typecheck
npm test
```

## Todo List

- [ ] Create `.github/workflows/` directory
- [ ] Write `ci.yml` workflow file
- [ ] Verify `npm run typecheck` passes locally
- [ ] Verify `npm test` passes locally
- [ ] Document required GitHub secrets in PR description
- [ ] Push and verify workflow runs on PR

## Success Criteria

1. PR to main triggers check job (typecheck + test)
2. Push to main triggers check + deploy jobs
3. Deploy job uses `CLOUDFLARE_API_TOKEN` secret
4. Concurrency cancels redundant runs on same branch
5. CI completes in <5 min

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `CLOUDFLARE_API_TOKEN` not set → deploy fails | Deploy job in `production` environment; document secret setup in PR |
| `wrangler types` requires CF account access in CI | `npm run typecheck` calls `cf-typegen` which runs `wrangler types`; this generates types from `wrangler.jsonc` locally without API calls |
| Node 22 compatibility | Project already uses modern ESM + Node 22 features; matches local dev |

## Security Considerations
- `CLOUDFLARE_API_TOKEN` stored as GitHub secret, never logged
- Deploy job runs only on main push, not on PRs (prevents fork abuse)
- `production` environment can have required reviewers as additional gate
- No secrets passed to check job
