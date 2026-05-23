#!/usr/bin/env bash
# =============================================================================
# art-pipeline.sh — Automated Art Direction Pipeline
# =============================================================================
# Usage:
#   art-pipeline.sh init                      Create project style guide scaffold
#   art-pipeline.sh generate <type> <name>   Generate asset with auto-review
#   art-pipeline.sh review <image-path>      Run vision review on image
#   art-pipeline.sh batch <type> <count>     Batch generate + review
#   art-pipeline.sh style-guide              Print current style guide
#   art-pipeline.sh template <type>          Print prompt template for type
#
# Pipeline: Style Guide → Prompt Template → Generate → Vision Review → Approve/Reject → Save
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORGEWRIGHT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
STYLE_GUIDE_DIR="${FORGEWRIGHT_DIR}/.forgewright/art-direction"
TEMPLATES_DIR="${FORGEWRIGHT_DIR}/skills/art-director/prompt-templates"
REVIEWS_DIR="${FORGEWRIGHT_DIR}/.forgewright/art-reviews"
VISION_REVIEW="${SCRIPT_DIR}/vision-review.sh"

# Default style guide location
PROJECT_STYLE_GUIDE="${STYLE_GUIDE_DIR}/.style-guide.json"

# ---- helpers ----------------------------------------------------------------

log()   { printf "[art-pipeline] %s\n" "$*"; }
warn()  { printf "[art-pipeline] WARNING: %s\n" "$*" >&2; }
info()  { printf "[art-pipeline] ℹ  %s\n" "$*"; }
die()   { printf "[art-pipeline] ERROR: %s\n" "$*" >&2; exit 1; }
need()  { command -v "$1" &>/dev/null || die "Required: $1 (not found in PATH)"; }

# Color codes
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"
RESET="\033[0m"

# Global for style guide temp file (avoids JSON # hex values breaking bash)
_STYLE_GUIDE_TMP=""

# ---- style guide helpers -----------------------------------------------------

load_style_guide() {
    if [[ -f "$PROJECT_STYLE_GUIDE" ]]; then
        cat "$PROJECT_STYLE_GUIDE"
    else
        echo "{}"
    fi
}

# Use temp file to avoid JSON breaking bash pattern substitution
# (hex values like #6366F1 contain # which bash treats as comment)
_load_sg_to_tmp() {
    if [[ -n "$_STYLE_GUIDE_TMP" ]] && [[ -f "$_STYLE_GUIDE_TMP" ]]; then
        return
    fi
    _STYLE_GUIDE_TMP="$(mktemp)"
    load_style_guide > "$_STYLE_GUIDE_TMP"
}

style_guide_exists() {
    [[ -f "$PROJECT_STYLE_GUIDE" ]]
}

get_style_token() {
    local key="$1"
    _load_sg_to_tmp
    python3 - "$_STYLE_GUIDE_TMP" "$key" <<'PYEOF'
import json, sys
path, key = sys.argv[1], sys.argv[2]
with open(path) as f:
    d = json.load(f)
print(d.get(key, "NOT_SET"))
PYEOF
}

# ---- command: init ----------------------------------------------------------
# Create project style guide scaffold

cmd_init() {
    local project_type="${1:-app}"  # app | game-2d | game-3d | mixed

    log "Initializing Art Direction for project type: $project_type"

    mkdir -p "$STYLE_GUIDE_DIR"/{color-palettes,typography,lighting,perspective,mood-board,prohibited}
    mkdir -p "$TEMPLATES_DIR"/{ui,game-2d,game-3d,_shared}
    mkdir -p "$REVIEWS_DIR"

    # Create default style guide
    cat > "$PROJECT_STYLE_GUIDE" <<'EOF'
{
  "version": "1.0.0",
  "project_type": "app",
  "created_at": "",
  "primary_color": "#6366F1",
  "accent_color": "#8B5CF6",
  "background_color": "#FFFFFF",
  "text_color": "#1F2937",
  "muted_color": "#6B7280",
  "border_color": "#E5E7EB",
  "success_color": "#10B981",
  "warning_color": "#F59E0B",
  "error_color": "#EF4444",
  "font_heading": "Inter",
  "font_body": "Inter",
  "font_mono": "JetBrains Mono",
  "border_radius_sm": "6",
  "border_radius_md": "8",
  "border_radius_lg": "12",
  "spacing_unit": "4",
  "shadow_sm": "0 1px 2px rgba(0,0,0,0.05)",
  "shadow_md": "0 4px 6px rgba(0,0,0,0.1)",
  "shadow_lg": "0 10px 15px rgba(0,0,0,0.1)",
  "camera_angle": "not-set",
  "lighting_direction": "not-set",
  "tile_size": "64",
  "character_height_tiles": "4",
  "ai_tells_prohibited": [
    "purple_neon_glow",
    "three_equal_columns",
    "centered_hero_gradient",
    "generic_inter_font",
    "circular_spinner",
    "pure_black_000000",
    "fake_round_numbers",
    "generic_placeholder_names",
    "ai_buzzwords",
    "outer_glow_shadows",
    "default_shadcn"
  ],
  "generation_history": []
}
EOF

    # Update timestamp and project type
    local sg_path="$PROJECT_STYLE_GUIDE"
    local pt="$project_type"
    python3 - "$sg_path" "$pt" <<'PYEOF'
import json, datetime, sys
path, proj_type = sys.argv[1], sys.argv[2]
with open(path) as f:
    d = json.load(f)
d["created_at"] = datetime.datetime.now().isoformat()
d["project_type"] = proj_type
with open(path, 'w') as f:
    json.dump(d, f, indent=2)
PYEOF

    log "Created style guide: $PROJECT_STYLE_GUIDE"
    log ""
    log "Next steps:"
    log "  1. Edit $PROJECT_STYLE_GUIDE with your project colors/fonts"
    log "  2. Add reference images to $STYLE_GUIDE_DIR/mood-board/"
    log "  3. Run: art-pipeline.sh generate <type> <name>"
    log ""
    log "Available generation types:"
    log "  UI:         button, card, modal, form, menu, hud, hero, dashboard"
    log "  Game 2D:    character, sprite, background, tile, icon, environment"
    log "  Game 3D:    character, prop, scene, lighting-setup"
}

# ---- command: generate ------------------------------------------------------
# Generate asset: load template + inject style tokens + call AI + review

cmd_generate() {
    local asset_type="${1:-}"    # button, character, etc.
    local asset_name="${2:-}"    # custom name
    local max_retries="${3:-3}"  # max regeneration attempts

    if [[ -z "$asset_type" ]]; then
        die "Usage: art-pipeline.sh generate <asset-type> <name> [--retry N]"
    fi

    if ! style_guide_exists; then
        warn "No style guide found. Run 'art-pipeline.sh init' first."
        warn "Using generic defaults — results may vary."
    fi

    log "${BOLD}Generating:${RESET} $asset_type / $asset_name"
    log "Style guide: $PROJECT_STYLE_GUIDE"

    # Determine template path
    local template_path=""
    local template_type="ui"

    # Check UI templates
    if [[ -f "$TEMPLATES_DIR/ui/$asset_type.md" ]]; then
        template_path="$TEMPLATES_DIR/ui/$asset_type.md"
        template_type="ui"
    elif [[ -f "$TEMPLATES_DIR/game-2d/$asset_type.md" ]]; then
        template_path="$TEMPLATES_DIR/game-2d/$asset_type.md"
        template_type="game-2d"
    elif [[ -f "$TEMPLATES_DIR/game-3d/$asset_type.md" ]]; then
        template_path="$TEMPLATES_DIR/game-3d/$asset_type.md"
        template_type="game-3d"
    else
        die "No template found for: $asset_type"$'\n'"Available types: button, card, character, sprite, etc."
    fi

    log "Using template: $template_path"

    # Inject style tokens into template
    local prompt
    prompt=$(inject_style_tokens "$template_path")

    log "Prompt generated (first 500 chars):"
    echo "$prompt" | head -c 500 | sed 's/^/  /'
    echo ""

    # Check what generation tool is available
    local gen_cmd=""
    local output_file=""

    if command -v claude &>/dev/null; then
        info "Using Claude for generation (add --image flag support needed)"
        # Claude doesn't auto-generate images — need to describe what to generate
        # The user would generate via their preferred tool and then review
        log "${YELLOW}Note: Claude CLI doesn't generate images directly.${RESET}"
        log "Please generate the asset using your preferred AI image tool:"
        log "  - Gemini CLI (Antigravity): gemini generate '<prompt>'"
        log "  - Midjourney / DALL-E / Stable Diffusion"
        log "  - Unity AI tools / Figma AI"
        log ""
        log "After generation, run:"
        log "  art-pipeline.sh review <path-to-generated-image>"
        log ""
        log "Or use the prompt below as input for your image generation tool:"
        log "${BOLD}${CYAN}--- GENERATION PROMPT ---${RESET}"
        echo "$prompt"
        log "${BOLD}${CYAN}--- END PROMPT ---${RESET}"
        return 0
    elif command -v gemini &>/dev/null; then
        gen_cmd="gemini"
    else
        warn "No AI image generation CLI found (claude, gemini)."
        log "Please install Antigravity CLI or use another image generation tool."
        log ""
        log "Displaying generation prompt:"
        echo "$prompt"
        return 0
    fi

    # Generation + review loop
    local attempt=0
    local review_result=""

    while [[ $attempt -lt $max_retries ]]; do
        attempt=$((attempt + 1))
        log "--- Generation attempt $attempt/$max_retries ---"

        # TODO: Actual generation call would go here
        # For now, log what would happen
        warn "Image generation requires integration with your preferred AI image tool."
        warn "This script provides the prompt. Use it with your image generator, then:"
        warn "  art-pipeline.sh review <output-path>"

        break
    done
}

# Inject style tokens from style guide into template
inject_style_tokens() {
    local template_path="$1"

    # Load style guide to temp file (avoids # hex values breaking bash)
    _load_sg_to_tmp

    # Read template
    local content
    content=$(cat "$template_path")

    # Replace all tokens using get_style_token (which uses the temp file)
    # Note: we do these in a loop to avoid 30+ subshells from get_style_token calls
    local replacements=""
    _load_sg_to_tmp
    replacements=$(python3 - "$_STYLE_GUIDE_TMP" <<'PYEOF'
import json, sys
path = sys.argv[1]
with open(path) as f:
    d = json.load(f)

tokens = {
    "PRIMARY_HEX": d.get("primary_color", "NOT_SET"),
    "ACCENT_HEX": d.get("accent_color", "NOT_SET"),
    "BG_HEX": d.get("background_color", "NOT_SET"),
    "TEXT_HEX": d.get("text_color", "NOT_SET"),
    "MUTED_HEX": d.get("muted_color", "NOT_SET"),
    "BORDER_HEX": d.get("border_color", "NOT_SET"),
    "SUCCESS_HEX": d.get("success_color", "NOT_SET"),
    "WARNING_HEX": d.get("warning_color", "NOT_SET"),
    "ERROR_HEX": d.get("error_color", "NOT_SET"),
    "HEADING_FONT": d.get("font_heading", "NOT_SET"),
    "BODY_FONT": d.get("font_body", "NOT_SET"),
    "MONO_FONT": d.get("font_mono", "NOT_SET"),
    "BR_SM": d.get("border_radius_sm", "NOT_SET"),
    "BR_MD": d.get("border_radius_md", "NOT_SET"),
    "BR_LG": d.get("border_radius_lg", "NOT_SET"),
    "SHADOW_SM": d.get("shadow_sm", "NOT_SET"),
    "SHADOW_MD": d.get("shadow_md", "NOT_SET"),
    "SHADOW_LG": d.get("shadow_lg", "NOT_SET"),
    "CAMERA_ANGLE": d.get("camera_angle", "NOT_SET"),
    "LIGHTING_DIR": d.get("lighting_direction", "NOT_SET"),
    "TILE_SIZE": d.get("tile_size", "NOT_SET"),
    "CHAR_HEIGHT_TILES": d.get("character_height_tiles", "NOT_SET"),
}
for k, v in tokens.items():
    print(f"{k}={v}")
PYEOF
    )

    while IFS='=' read -r key value; do
        content="${content//\[${key}\]/$value}"
    done <<< "$replacements"

    # Add style guide reference at top
    local sg_summary
    sg_summary=$(python3 - "$_STYLE_GUIDE_TMP" <<'PYEOF'
import json, sys
path = sys.argv[1]
with open(path) as f:
    d = json.load(f)
tokens = {
    "Project Type": d.get("project_type", "unknown"),
    "Primary": d.get("primary_color", "NOT_SET"),
    "Accent": d.get("accent_color", "NOT_SET"),
    "Background": d.get("background_color", "NOT_SET"),
    "Text": d.get("text_color", "NOT_SET"),
    "Heading Font": d.get("font_heading", "NOT_SET"),
    "Body Font": d.get("font_body", "NOT_SET"),
    "Camera": d.get("camera_angle", "NOT_SET"),
    "Lighting": d.get("lighting_direction", "NOT_SET"),
}
lines = ["## Project Style Guide", ""]
for k, v in tokens.items():
    lines.append(f"- **{k}**: `{v}`")
print("\n".join(lines))
PYEOF
)
    sg_summary=$(echo "$sg_summary" | sed 's/^/  /')

    # Add prohibited elements
    local prohibited
    prohibited=$(python3 - "$_STYLE_GUIDE_TMP" <<'PYEOF'
import json, sys
path = sys.argv[1]
with open(path) as f:
    d = json.load(f)
items = d.get("ai_tells_prohibited", [])
if items:
    lines = ["", "## Prohibited (AI Tells — NEVER include):", ""]
    for item in items:
        lines.append(f"- ~~{item}~~")
    print("\n".join(lines))
else:
    print("")
PYEOF
)

    echo "$sg_summary"
    echo "$prohibited"
    echo ""
    echo "$content"
}

# ---- command: review --------------------------------------------------------

cmd_review() {
    local image_path="${1:-}"

    if [[ -z "$image_path" ]]; then
        die "Usage: art-pipeline.sh review <image-path>"
    fi

    if [[ ! -f "$image_path" ]]; then
        die "Image not found: $image_path"
    fi

    if [[ ! -x "$VISION_REVIEW" ]]; then
        chmod +x "$VISION_REVIEW"
    fi

    "$VISION_REVIEW" review "$image_path"
}

# ---- command: batch ---------------------------------------------------------

cmd_batch() {
    local asset_type="${1:-}"
    local count="${2:-8}"

    if [[ -z "$asset_type" ]]; then
        die "Usage: art-pipeline.sh batch <asset-type> <count>"
    fi

    if ! command -v claude &>/dev/null; then
        die "Batch review requires Claude CLI. Install from https://claude.ai"
    fi

    log "Batch generation + review: $asset_type (count: $count)"
    log "Note: Batch review only — generation is manual."
    log ""
    log "To batch review existing images:"
    log "  ./vision-review.sh batch './assets/*.png' --report"
}

# ---- command: style-guide ---------------------------------------------------

cmd_style_guide() {
    if style_guide_exists; then
        cat "$PROJECT_STYLE_GUIDE" | python3 -m json.tool 2>/dev/null || cat "$PROJECT_STYLE_GUIDE"
    else
        info "No style guide found. Run: art-pipeline.sh init"
    fi
}

# ---- command: template -------------------------------------------------------

cmd_template() {
    local template_type="${1:-}"

    if [[ -z "$template_type" ]]; then
        log "Available templates:"
        echo ""
        echo "  UI:"
        ls "$TEMPLATES_DIR/ui/" 2>/dev/null | sed 's/^/    /'
        echo ""
        echo "  Game 2D:"
        ls "$TEMPLATES_DIR/game-2d/" 2>/dev/null | sed 's/^/    /'
        echo ""
        echo "  Game 3D:"
        ls "$TEMPLATES_DIR/game-3d/" 2>/dev/null | sed 's/^/    /'
        echo ""
        echo "Usage: art-pipeline.sh template <type>"
        return 0
    fi

    local template_path=""
    if [[ -f "$TEMPLATES_DIR/ui/$template_type.md" ]]; then
        template_path="$TEMPLATES_DIR/ui/$template_type.md"
    elif [[ -f "$TEMPLATES_DIR/game-2d/$template_type.md" ]]; then
        template_path="$TEMPLATES_DIR/game-2d/$template_type.md"
    elif [[ -f "$TEMPLATES_DIR/game-3d/$template_type.md" ]]; then
        template_path="$TEMPLATES_DIR/game-3d/$template_type.md"
    else
        die "Template not found: $template_type"
    fi

    inject_style_tokens "$template_path"
}

# ---- command: update-style --------------------------------------------------
# Update a specific style token

cmd_update_style() {
    local key="$1"
    local value="$2"

    if [[ -z "$key" ]] || [[ -z "$value" ]]; then
        die "Usage: art-pipeline.sh update-style <key> <value>"
    fi

    if ! style_guide_exists; then
        die "No style guide found. Run 'art-pipeline.sh init' first."
    fi

    python3 - <<PYEOF
import json, datetime
path = """'"$PROJECT_STYLE_GUIDE"'"""
with open(path) as f:
    d = json.load(f)
d["$key"] = "$value"
d["updated_at"] = datetime.datetime.now().isoformat()
with open(path, 'w') as f:
    json.dump(d, f, indent=2)
print(f"Updated: $key = $value")
PYEOF

    log "Style guide updated: $key = $value"
}

# ---- main -------------------------------------------------------------------

main() {
    local cmd="${1:-}"
    shift || true

    # Ensure directories exist
    mkdir -p "$STYLE_GUIDE_DIR" "$REVIEWS_DIR" "$TEMPLATES_DIR"

    case "$cmd" in
        init)
            cmd_init "$@"
            ;;
        generate|gen)
            cmd_generate "$@"
            ;;
        review)
            cmd_review "$@"
            ;;
        batch)
            cmd_batch "$@"
            ;;
        style-guide|sg)
            cmd_style_guide
            ;;
        template|t)
            cmd_template "$@"
            ;;
        update-style|set)
            cmd_update_style "$@"
            ;;
        help|-h|--help|"")
            cat <<'EOF'
art-pipeline.sh — Art Direction Pipeline

  Initialize project style guide:
    art-pipeline.sh init [app|game-2d|game-3d|mixed]

  Generate asset with style constraints:
    art-pipeline.sh generate <type> <name>

  Run vision review on generated image:
    art-pipeline.sh review <image-path>

  Batch review existing assets:
    art-pipeline.sh batch <asset-type> <count>

  Show current style guide:
    art-pipeline.sh style-guide

  Show prompt template:
    art-pipeline.sh template <type>

  Update style token:
    art-pipeline.sh update-style <key> <value>

  Asset types:
    UI:       button, card, modal, form, menu, hud, hero, dashboard
    Game 2D:  character, sprite, background, tile, icon, environment
    Game 3D:  character, prop, scene, lighting-setup

Examples:
  art-pipeline.sh init game-2d
  art-pipeline.sh generate button primary-cta
  art-pipeline.sh generate character knight
  art-pipeline.sh review ./output/button-1.png
  art-pipeline.sh update-style primary_color "#8B5CF6"

Environment:
  PROJECT_STYLE_GUIDE   Path to style guide JSON
  TEMPLATES_DIR         Path to prompt templates
EOF
            ;;
        *)
            die "Unknown command: $cmd. Use 'help' for usage."
            ;;
    esac
}

main "$@"
