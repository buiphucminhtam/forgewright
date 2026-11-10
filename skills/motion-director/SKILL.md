---
name: motion-director
description: Use when designing motion concepts, animation systems, choreography, timing, easing, reduced-motion behavior, or deciding which motion stack to use for web UI, video, GIF, Rive, Lottie, GSAP, Motion, Remotion, or Three.js work.
version: 1.0.0
license: CC0-1.0
upstream_repository: https://github.com/frankxai/awesome-motion-design-agent-skills
upstream_commit: 713a8680f975cabc7f9fc9e462ebfd9532694f85
upstream_listing: https://www.skillsdirectory.com/skills/frankxai-motion-director
---

# Motion Director

> **Provenance & Integration Boundary:** Vendored from `frankxai/awesome-motion-design-agent-skills` (`skills/motion-director/SKILL.md` @ `713a8680f975cabc7f9fc9e462ebfd9532694f85`, CC0-1.0). Within Forgewright, UI/frontend/game specialists retain implementation ownership and the pipeline controller retains orchestration authority; `motion-director` supplies motion intent, stack selection, choreography/timing tokens, interruption/reduced-motion contracts, and rubric-based QA. Reuse existing project runtimes or native CSS when sufficient; never install heavy animation libraries (GSAP, Motion, Rive, Lottie, Remotion, Three.js) unless explicitly justified by the task.

## Workflow

1. Identify the output target: product UI, landing page, social video, GIF, design prototype, or embedded animation asset.
2. Define the job of motion: guide attention, explain state, create delight, teach a concept, or express brand.
3. Inspect the existing implementation and choose the lightest suitable stack:
   - Native CSS transitions for simple hover, press, and state feedback.
   - Motion for React UI state and layout transitions.
   - GSAP for timelines, scroll, SVG, text, and high-control choreography.
   - Rive for interactive state-machine animation.
   - Lottie for portable vector loops.
   - Remotion for rendered video/GIF.
   - Three.js for spatial/3D scenes.
4. Specify timing tokens, easing, stagger rules, and reduced-motion behavior.
5. Patch the owned code, or provide a concrete handoff if this session cannot write it. Do not start another agent without authorization.
6. Capture output and use the bundled [motion quality rubric](references/motion-quality-rubric.md). Leave unobserved categories unscored.

## Interaction contract

- Decide whether motion helps before adding it. Keep frequent keyboard commands immediate; never delay focus or input behind an entrance.
- Reuse existing tokens. For occasional UI transitions, start at 150-250 ms with an ease-out curve; explain longer narrative timing separately.
- Prefer transform and opacity, and name transition properties explicitly. Check actual browser behavior before claiming compositor acceleration.
- Define interruption, reversal, exit, and cleanup. Repeated clicks must settle to the latest requested state.
- Gate hover-only movement with `(hover: hover) and (pointer: fine)`. Keep a visible keyboard focus state and touch access to every action.
- Design reduced motion before implementation: preserve content, state, and reading order with static or gentle opacity/color feedback.
- Pause continuous decoration when hidden or off-screen. Preserve meaningful progress and status information.

## Verification and boundaries

Inspect desktop, a phone width, keyboard focus, touch behavior, reduced motion, and a transition interrupted in both directions. Cite the exact code revision and evidence paths. A build or screenshot alone cannot establish smoothness, touch behavior, or motion quality.

Read the current [Motion documentation](https://motion.dev/docs) or [GSAP documentation](https://gsap.com/docs/v3/) for the installed runtime before changing APIs. This skill supplies direction; it does not install a renderer or grant permission to spend, publish, or change unrelated files.

## Output Shape (Motion Packet in Task Artifacts)

Return:

- Motion goal
- Recommended stack
- Choreography
- Timing/easing tokens
- Reduced-motion path
- Interruption & cleanup rules
- Implementation notes
- QA checklist & rubric evaluation (unobserved categories marked `unscored`)
