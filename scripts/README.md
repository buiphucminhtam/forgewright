# Scripts Directory

This directory contains utility scripts, deployment automation, and testing harnesses.

Scripts are categorized into domain-specific subdirectories. 
For a complete inventory, see the [Script Catalog](../docs/reference/script-catalog.md).

## Compatibility Policy

Externally documented root-level scripts will retain forwarding shims for one release to aid migration.
Please update any automated CI workflows to use the new domain paths (e.g., `scripts/ci/run-self-tests.sh`).

## Adding new scripts

1. Place the script in the appropriate domain subdirectory.
2. Add a short description as a comment block at the top of the script.
3. Run `node scripts/catalog/generate-script-catalog.mjs` to update the catalog.
