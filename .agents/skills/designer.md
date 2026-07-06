---
name: designer
description: "Handles UX/UI design, creates layouts, drafts design contracts, and instructs Nano Banana to generate assets."
---

# UI/UX Designer Skill

This skill guides the agent in handling high-end visual design, layout planning, and asset generation using Nano Banana and Stitch.

## Core Directives

1. **Verify Design DNA**: Before editing any frontend code, search for `.agents/design_dna.json`. Always load this file into context and respect the defined typography, color tokens, and components style.
2. **Mockups First**: Generate a high-resolution mockup using Nano Banana and obtain visual approval from the user before writing HTML/CSS/Tailwind code.
3. **Structured Prompting**: Always prompt Nano Banana using the **SCALIST** framework and structured JSON prompting.
4. **Accessibility (WCAG AA)**: Ensure contrast ratios (minimum 4.5:1), keyboard focus navigation, and descriptive ARIA/alt labels are implemented for all generated interfaces.
5. **UI Design Gate**: Generate a design contract containing the responsive behavior matrix, component states, and token audit before any implementation begins.

## The SCALIST Framework

Every prompt for Nano Banana must structure the following dimensions:
* **S**ubject: Detailed description of UI component or asset.
* **C**omposition: Shot angle, aspect ratio (e.g. 1:1, 16:9, 9:16).
* **A**ction: User states or active layouts.
* **L**ocation: Environmental background (e.g. clean slate dark container).
* **I**mage Style: Visual aesthetic (e.g. glassmorphism UI, flat vector).
* **S**pecs: Technical properties (e.g. sharp focus on typography).
* **T**ext Rendering: Spelling, font families, and layout positions of labels.

## Example JSON Prompt for Nano Banana

```json
{
  "model": "gemini-3-pro-image",
  "prompt_structure": {
    "subject": "A premium dashboard UI card component displaying monthly analytics charts.",
    "composition": "Flat lay, direct top-down view, 16:9 aspect ratio.",
    "action": "Showing bar charts and key metrics in green, glowing indicators.",
    "location": "Floating over a clean slate dark gray container background.",
    "style": "Glassmorphism UI, translucent container with 12px border radius and thin borders.",
    "specs": "Sharp focus on typography and chart elements, volumetric studio lighting.",
    "text_rendering": {
      "heading": "Monthly Sales Overview",
      "value": "+24.8% growth this month",
      "font_description": "Clean sans-serif typeface, Outfit font style.",
      "language": "en"
    }
  },
  "settings": {
    "resolution": "2K",
    "aspect_ratio": "16:9"
  }
}
```

## Stitch 3-Phase Loop

When Stitch is configured as the design engine (`kof-stitch-mcp`):
1. **Design DNA Extraction**: Extract token definitions from style references into `design_dna.json`.
2. **Visual Audit**: Perform consistency checks. Reject any design with misaligned margins, non-compliant colors, or overlapping elements.
3. **Refinement**: Conversationally instruct Stitch to modify specific containers until visual audit passes.
