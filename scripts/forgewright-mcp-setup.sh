#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# ⚠️ DEPRECATED: Use fw-global-setup.sh instead
#
# This script is deprecated. Please use the new global setup:
#   bash scripts/fw-global-setup.sh
#
# The new global setup:
#   - ONE setup for ALL projects and IDEs
#   - No per-project configuration needed
#   - Works automatically with any project
# ─────────────────────────────────────────────────────────────────

echo -e "\033[0;33m⚠️ WARNING: forgewright-mcp-setup.sh is deprecated.\033[0m"
echo -e "Please use the new global setup:"
echo -e "  bash scripts/fw-global-setup.sh"
echo ""
echo "Benefits:"
echo "  - ONE setup for ALL projects and IDEs"
echo "  - No per-project configuration needed"
echo "  - Works automatically with any project"
echo ""

# Offer to run the new setup
if [[ -f "${BASH_SOURCE[0]%/*}/fw-global-setup.sh" ]]; then
    echo -n "Run new setup now? [Y/n] "
    read -r response
    if [[ ! "$response" =~ ^[Nn]$ ]]; then
        bash "${BASH_SOURCE[0]%/*}/fw-global-setup.sh"
    fi
fi
