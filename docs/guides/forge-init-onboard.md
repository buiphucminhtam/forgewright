# Forge Init and Onboard Golden Path

This is the canonical project-local onboarding path for the Forgewright CLI. It records deterministic filesystem facts only; it does not call a model, upload project content, install project dependencies, or claim that the project is production-ready.

## Prerequisites

- Node.js 18 or newer.
- The `@forgewright/cli` package installed so the `forge` executable is available.
- A project directory you are authorized to modify.

## Ten-Minute Sample Workflow

Run these commands from the project root:

```bash
forge --json init .
forge --json onboard .
```

`init` creates `.forgewright/project.json`. `onboard` then creates `.forgewright/project-profile.json` containing only detected filesystem facts: Git metadata presence, `package.json` presence, recognized lockfiles, and the declared npm test script when readable.

Both commands are idempotent by default. Existing files return `already_exists` and are not overwritten. Use `--force` only when deliberately refreshing generated data:

```bash
forge --json onboard . --force
```

The required golden test executes creation, idempotent re-runs, missing-manifest failure, overwrite protection, and explicit refresh in a temporary project. Its runtime gate is ten minutes:

```bash
npm run test:golden
```
