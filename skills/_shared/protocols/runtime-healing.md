---
name: runtime-healing
description: Global protocol for runtime self-healing, log streaming watchdogs, and zero-exception tolerance.
version: 1.0.0
---

# Runtime Healing Protocol (The Watchdog)

**Goal:** Eliminate "Happy Path" hallucinations and ensure 100% post-feature stability by forcing AI agents to parse raw execution logs and self-correct runtime exceptions before marking a task as "Done."

## 1. The Log Check Mandate
No execution phase (BUILD or HARDEN) is complete until the agent runs the target application and pulls the runtime execution logs to hunt for errors.
- **Node/Backend:** Tail `pm2 logs`, Docker output, or `stdout` (last 100 lines).
- **Mobile:** Run the app on emulator/device and execute `adb logcat -d | grep -i " E/"` (Android) or `xcrun simctl spawn booted log stream` (iOS).
- **Unity/Games:** Pull from `~/.config/unity3d/Editor.log` (Linux), `~/Library/Logs/Unity/Editor.log` (Mac), `%LOCALAPPDATA%\Unity\Editor\Editor.log` (Windows), or use the `unity-skills` REST API to fetch Console output.
- **Frontend/Web:** Check the browser console output using Playwright or Midscene during test execution.

## 2. Zero-Exception Policy
If the word `Exception`, `Error`, `Crash`, or `NullReference` is detected in the log stream:
1. **DO NOT pass the gate.** You are legally barred from finishing the task.
2. **Self-Correction Loop:** You must instantly enter an internal Debugger protocol. Isolate the stack trace, hypothesize the root cause using GitNexus context, apply the fix, and re-run the log check.
3. Repeat until the log stream is perfectly clean (0 exceptions).

## 3. Visual & Console Dual-Verification
For systems with graphical interfaces (Games, UI, Mobile Apps), capturing a screenshot is NOT enough.
- You must capture the screenshot (`camera_screenshot`, `page.screenshot()`) **AND** the Console Log simultaneously.
- A beautiful screenshot is invalid if the backend console is throwing silent NullReference errors. Bot visual and console streams must be clean.

## 4. Bypassing False Positives
If the log contains known, harmless warnings (e.g., "Deprecation Warning" or standard third-party telemetry timeouts), use your judgement to whitelist them. Document any bypassed warnings in your final task output to the user.
