# ADR-007: Versioned MCP and CLI release artifacts

**Status:** Accepted — local release gate verified; no hosted release has been created by this decision.

## Decision

A future release tag must be `vX.Y.Z`, and `X.Y.Z` must equal the versions in both `mcp/package.json` and `src/cli/package.json`. The release workflow refuses a nonconforming tag before building or publishing anything.

The workflow treats the MCP package and CLI package as the two canonical release artifacts. For a conforming tag it:

1. builds, type-checks, and tests both packages, including the CLI init/onboard golden path;
2. packs both workspaces, checks their published entrypoints, and installs the CLI's production dependencies in an isolated temporary directory before invoking `--help`;
3. emits a CycloneDX SBOM for each workspace, uploads all artifacts as release evidence, and creates a GitHub provenance attestation for the packed artifacts;
4. rehearses rollback selection in an isolated detached worktree without changing a tag, GitHub Release, or published package.

All active GitHub Actions and the active oasdiff installer are commit/checksum pinned. The release and CI checks fail closed for mutable actions, `curl | shell`, global unpinned npm installs, unpinned `npx`, or direct unpinned `pip install` in active workflow/composite YAML.

## Consequences

The current package versions intentionally do not qualify for a new shared tag (`mcp` is `1.0.0`, CLI is `0.1.0`). A future coordinated version bump is required before creating a release tag; this ADR does not alter package versions, create a tag, publish packages, or create a GitHub Release.

The rollback rehearsal proves deterministic selection of the most recent preceding semver tag. It is not an automatic rollback mechanism and does not mutate an existing artifact.
