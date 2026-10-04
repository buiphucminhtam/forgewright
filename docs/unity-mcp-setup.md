# Unity-MCP Setup Guide

## Overview

Hướng dẫn cài đặt và cấu hình **Unity-MCP** (IvanMurzak/Unity-MCP) để tích hợp với Forgewright Unity skills.

Số tool, phiên bản Editor hỗ trợ và cách kết nối phụ thuộc bản Unity-MCP được pin.
Chưa có Unity Editor/bridge được xác minh trên máy dùng cho đợt nâng cấp này, nên
Unity live smoke hiện là **UNVERIFIED**.

Các cấu hình bên dưới là mẫu tham khảo lịch sử, chưa phải cấu hình đã kiểm chứng
cho upstream hiện tại. Trước khi cài, xác minh Editor từ `ProjectVersion.txt`,
Test Framework từ package lock và pin chính xác bridge local. Chỉ dùng loopback.
Không tự chạy installer, đăng nhập cloud OAuth, tạo credentials hoặc bật quyền
reflection/Roslyn. Các ví dụ Docker/HTTP không phải lựa chọn mặc định cho local
ForgeWright. Không thực hiện bước đó trong đợt nâng cấp này.

---

## Prerequisites

- Unity Editor đúng phiên bản của project và tương thích bản bridge đã pin
- Runtime CLI theo yêu cầu của đúng bản bridge đã pin
- AI agent hỗ trợ MCP (Claude Code, Cursor, Gemini, Copilot)

> **⚠️ Important:** Project path không được chứa spaces
> - ✅ `C:/MyProjects/MyProject`
> - ❌ `C:/My Projects/MyProject`

---

## Installation

### Option 1: CLI (historical example, verify before use)

#### 1.1 Install unity-mcp-cli

```bash
npm install -g unity-mcp-cli
```

#### 1.2 Install Unity-MCP Plugin

```bash
# Di chuyển đến Unity project
cd ./MyUnityProject

# Cài plugin vào project
unity-mcp-cli install-plugin .
```

#### 1.3 Open Unity Project

```bash
# Mở Unity project (plugin sẽ auto-connect)
unity-mcp-cli open .
```

#### 1.4 Setup AI Agent

```bash
# Generate config cho Claude Code
unity-mcp-cli setup-skills claude-code .
```

### Option 2: Manual Installation

#### 1. Download Installer

Tải `.unitypackage` từ [Unity Asset Store](https://github.com/IvanMurzak/Unity-MCP/releases)

#### 2. Import vào Unity

```
Assets → Import Package → Custom Package → chọn file .unitypackage
```

#### 3. Configure AI Agent

Mở `Window/AI Game Developer` trong Unity Editor, click `Auto-generate Skills`

---

## Configuration

### Claude Code

#### macOS (Apple Silicon)

```json
{
  "mcpServers": {
    "ai-game-developer": {
      "command": "/Users/you/Projects/MyUnityProject/Library/mcp-server/osx-arm64/unity-mcp-server",
      "args": ["--port=8080", "--client-transport=stdio"]
    }
  }
}
```

#### macOS (Intel)

```json
{
  "mcpServers": {
    "ai-game-developer": {
      "command": "/Users/you/Projects/MyUnityProject/Library/mcp-server/osx-x64/unity-mcp-server",
      "args": ["--port=8080", "--client-transport=stdio"]
    }
  }
}
```

#### Windows

```json
{
  "mcpServers": {
    "ai-game-developer": {
      "command": "C:\\Projects\\MyUnityProject\\Library\\mcp-server\\win-x64\\unity-mcp-server.exe",
      "args": ["--port=8080", "--client-transport=stdio"]
    }
  }
}
```

### Cursor

Thêm vào `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ai-game-developer": {
      "command": "/path/to/unity-mcp-server",
      "args": ["--port=8080", "--client-transport=stdio"]
    }
  }
}
```

### Gemini CLI

```bash
gemini mcp add ai-game-developer <command>
```

---

## Docker Deployment

Các mẫu transport lịch sử dưới đây vẫn **UNVERIFIED**. Trước khi sử dụng, pin
image bằng digest đã kiểm chứng và duyệt riêng bước chạy bridge. Port chỉ được
bind vào loopback. Không chạy các mẫu này trong đợt nâng cấp hiện tại.

### streamableHttp Transport

```bash
docker run -p 127.0.0.1:8080:8080 ivanmurzakdev/unity-mcp-server
```

```json
{
  "mcpServers": {
    "ai-game-developer": {
      "url": "http://localhost:8080"
    }
  }
}
```

### stdio Transport

```bash
docker run -t -e MCP_PLUGIN_CLIENT_TRANSPORT=stdio -p 127.0.0.1:8080:8080 ivanmurzakdev/unity-mcp-server
```

---

## Usage with Forgewright

### Combined Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ Forgewright: Architecture Design (NO Unity Editor)              │
│ - SO framework, event channels, component architecture          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Unity-MCP: Scene Setup (Editor Automation)                      │
│ - Create GameObjects, assign components, setup materials        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Forgewright: Code Implementation (NO Unity Editor)              │
│ - Gameplay logic, event wiring, UI systems                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Unity-MCP: Testing & Verification                               │
│ - Run tests, capture screenshots, debug console                 │
└─────────────────────────────────────────────────────────────────┘
```

### Example: Create Player System

**Step 1: Design Architecture (Forgewright)**

```
# Prompt cho Forgewright:
"Design a player controller system using SO-first architecture.
 Include FloatVariable for health, GameEvent for damage, and
 single-responsibility components for movement and combat."
```

**Step 2: Setup Scene (Unity-MCP)**

```
# Use Unity-MCP tools:
gameobject-create(name="Player", parent="Game")
gameobject-component-add(object="Player", component="Rigidbody")
gameobject-component-add(object="Player", component="CapsuleCollider")
```

**Step 3: Implement Logic (Forgewright)**

```
# Prompt cho Forgewright:
"Implement PlayerHealth.cs that uses FloatVariable SO for health
 and raises GameEvent on damage. Follow the architecture we designed."
```

**Step 4: Test (Unity-MCP)**

```
# Use Unity-MCP tools:
editor-application-set-state(play=true)
console-get-logs(filter="Error")
screenshot-game-view()
```

---

## MCP Tools Reference

### Assets

| Tool | Description |
|------|-------------|
| `assets-copy` | Copy asset at path |
| `assets-create-folder` | Create folder in project |
| `assets-delete` | Delete assets |
| `assets-find` | Search asset database |
| `assets-material-create` | Create new material |
| `assets-prefab-create` | Create prefab from GameObject |
| `assets-prefab-instantiate` | Instantiate prefab in scene |
| `package-add` | Install UPM package |
| `package-list` | List installed packages |

### Scene & Hierarchy

| Tool | Description |
|------|-------------|
| `gameobject-create` | Create new GameObject |
| `gameobject-destroy` | Destroy GameObject |
| `gameobject-duplicate` | Duplicate GameObjects |
| `gameobject-modify` | Modify GameObject properties |
| `gameobject-component-add` | Add Component |
| `gameobject-component-modify` | Modify Component |
| `scene-create` | Create new scene |
| `scene-open` | Open scene |
| `scene-save` | Save scene |

### Scripting

| Tool | Description |
|------|-------------|
| `script-update-or-create` | Create/update C# file |
| `script-execute` | Execute C# via Roslyn |
| `script-read` | Read script content |
| `reflection-method-call` | Call C# method |
| `reflection-method-find` | Find method via reflection |

### Testing & Debug

| Tool | Description |
|------|-------------|
| `tests-run` | Run Unity tests |
| `console-get-logs` | Get Editor console logs |
| `screenshot-scene-view` | Screenshot scene view |
| `screenshot-game-view` | Screenshot game view |

### Editor Control

| Tool | Description |
|------|-------------|
| `editor-application-set-state` | Control play/pause |
| `editor-selection-get` | Get selection |
| `editor-selection-set` | Set selection |

---

## Troubleshooting

### "MCP Server not responding"

1. Check Unity Editor is open
2. Verify port matches (default 8080)
3. Restart Unity Editor
4. Reinstall plugin

### "Tool not found"

1. Check Unity-MCP version
2. Re-generate skills: `Window/AI Game Developer → Auto-generate`
3. Restart AI agent

### "Permission denied" (macOS)

```bash
chmod +x Library/mcp-server/osx-arm64/unity-mcp-server
```

### "Project path with spaces"

Unity-MCP không hỗ trợ paths có spaces. Di chuyển project đến path không có spaces.

### Connection timeout

Tăng timeout trong Unity Editor:
```
Window/AI Game Developer → Advanced → Plugin Timeout
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_PLUGIN_PORT` | 8080 | Connection port |
| `MCP_PLUGIN_CLIENT_TIMEOUT` | 10000 | Timeout (ms) |
| `MCP_PLUGIN_CLIENT_TRANSPORT` | streamableHttp | Transport type |

### Command Line Override

```bash
Unity.exe -batchmode -nographics \
  -UNITY_MCP_HOST=http://localhost:8080 \
  -UNITY_MCP_KEEP_CONNECTED=true \
  -UNITY_MCP_AUTH_OPTION=required \
  -UNITY_MCP_TOKEN=my-secret-token
```

---

## Extension Packages

### AI Animation

```bash
openupm add com.ivanmurzak.unity.ai-animation
```

### AI ParticleSystem

```bash
openupm add com.ivanmurzak.unity.ai-particle-system
```

### AI ProBuilder

```bash
openupm add com.ivanmurzak.unity.ai-probuilder
```

---

## Resources

- [Unity-MCP GitHub](https://github.com/IvanMurzak/Unity-MCP)
- [Documentation](https://github.com/IvanMurzak/Unity-MCP/wiki)
- [Discord Community](https://discord.gg/unity-mcp)
- [Forgewright Unity Skills](./unity-mcp-integration)

---

## Unity Build & Test Commands

### Build Commands by Platform

| Platform | Command | Output |
|----------|---------|--------|
| macOS Standalone | `unity -batchmode -quit -projectPath . -buildTarget StandaloneOSX -executeMethod BuildScript.Build` | `.app` |
| Windows Standalone | `unity -batchmode -quit -projectPath . -buildTarget StandaloneWindows64 -executeMethod BuildScript.Build` | `.exe` |
| Linux Standalone | `unity -batchmode -quit -projectPath . -buildTarget StandaloneLinux64 -executeMethod BuildScript.Build` | `.x86_64` |
| iOS | `unity -batchmode -quit -projectPath . -buildTarget iOS -executeMethod BuildScript.Build` | Xcode project |
| Android | `unity -batchmode -quit -projectPath . -buildTarget Android -executeMethod BuildScript.Build` | `.apk` / `.aab` |
| WebGL | `unity -batchmode -quit -projectPath . -buildTarget WebGL -executeMethod BuildScript.Build` | `Build/` |
| visionOS | `unity -batchmode -quit -projectPath . -buildTarget visionOS -executeMethod BuildScript.Build` | Xcode project |

### Build Script Template

```csharp
// Editor/BuildScript.cs
using UnityEditor;
using UnityEngine;

public static class BuildScript
{
    [MenuItem("Build/Build All Platforms")]
    public static void Build()
    {
        string[] args = System.Environment.GetCommandLineArgs();
        
        // Parse command line arguments
        string buildTarget = "StandaloneOSX";
        string outputPath = "Build";
        
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "-buildTarget" && i + 1 < args.Length)
                buildTarget = args[i + 1];
            if (args[i] == "-outputPath" && i + 1 < args.Length)
                outputPath = args[i + 1];
        }
        
        BuildPlayerOptions buildPlayerOptions = new BuildPlayerOptions
        {
            scenes = new[] { "Assets/Scenes/Gameplay.unity" },
            locationPathName = outputPath,
            target = BuildTargetFromString(buildTarget),
            options = BuildOptions.None
        };
        
        BuildPipeline.BuildPlayer(buildPlayerOptions);
    }
    
    private static BuildTarget BuildTargetFromString(string target)
    {
        return target switch
        {
            "StandaloneOSX" => BuildTarget.StandaloneOSX,
            "StandaloneWindows64" => BuildTarget.StandaloneWindows64,
            "iOS" => BuildTarget.iOS,
            "Android" => BuildTarget.Android,
            "WebGL" => BuildTarget.WebGL,
            _ => BuildTarget.StandaloneOSX
        };
    }
}
```

### Unity Test Framework Commands

Use the actual Unity Editor executable, not `dotnet test`, to run Unity Test Framework tests. Resolve the Editor version from `ProjectSettings/ProjectVersion.txt` and UTF from `Packages/packages-lock.json` before selecting versioned flags. No Editor was found at the standard Hub location on this Mac during this task, so native Unity execution remains **UNVERIFIED**.

```bash
# Supply paths discovered from the installed Editor and selected project.
"$UNITY_EDITOR" -batchmode -projectPath "$UNITY_PROJECT" -runTests \
  -testPlatform EditMode -testResults "$RESULTS/editmode.xml" -logFile "$RESULTS/editmode.log"
"$UNITY_EDITOR" -batchmode -projectPath "$UNITY_PROJECT" -runTests \
  -testPlatform PlayMode -testCategory Mechanics \
  -testResults "$RESULTS/mechanics.xml" -logFile "$RESULTS/mechanics.log"
```

The [UTF 1.3 command reference](https://docs.unity3d.com/Packages/com.unity.test-framework@1.3/manual/reference-command-line.html) documents `-runTests`, `-testPlatform` and `-testCategory`. This is a versioned reference, not a claim that UTF 1.3 is installed. Use the documentation matching the locked package. Validate exit code plus the XML tests/results and reject missing or zero executed tests. Headless graphics limitations can affect PlayMode tests.

Before using Unity MCP, inspect the installed bridge and pin its exact version. Prefer loopback/local-only transport. Cloud OAuth, reflection/Roslyn execution and remote endpoints are separate capabilities requiring explicit authority. Do not infer their approval from permission to run local tests.

### Headless Play Mode Test

```csharp
// Editor/PlayModeTest.cs
using UnityEngine;
using UnityEngine.TestTools;
using NUnit.Framework;
using System.Collections;

public class PlayModeTest
{
    [UnityTest]
    public IEnumerator GameStarts_WithStartButton_Click_LoadsGameplay()
    {
        // Setup scene
        var button = Object.FindObjectOfType<StartButton>();
        Assert.IsNotNull(button, "Start button not found");
        
        // Click start
        button.onClick?.Invoke();
        
        // Wait one frame
        yield return null;
        
        // Verify scene loaded
        Assert.IsTrue(SceneManager.GetActiveScene().name == "Gameplay");
    }
}
```

### CI/CD Build Pipeline

```yaml
# .github/workflows/unity-build.yml
name: Unity Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: gableroux/unity3d:2022.3.0f1-linux
    steps:
      - uses: actions/checkout@v4
      
      - name: Build WebGL
        run: |
          unity -batchmode -quit \
            -projectPath . \
            -buildTarget WebGL \
            -executeMethod BuildScript.Build \
            -logFile build.log
            
      - name: Upload Build
        uses: actions/upload-artifact@v4
        with:
          name: webgl-build
          path: Build/
```

### Editor Automation

```bash
# Open Unity project
unity -batchmode -projectPath ./MyGame

# Run editor script
unity -batchmode -quit -projectPath ./MyGame -executeMethod MyEditorScript.DoSomething

# Package export
unity -batchmode -quit -projectPath ./MyGame \
  -executeMethod AssetDatabase.ExportPackage \
  -logFile export.log

# Batch script execution
unity -batchmode -quit \
  -projectPath ./MyGame \
  -executeMethod BatchProcessor.ProcessAll \
  -BatchmodeArgs "-arg1 value1"
```
