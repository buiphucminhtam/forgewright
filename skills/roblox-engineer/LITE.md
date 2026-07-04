---
name: roblox-engineer
description: "Orchestrates Roblox game engine setups, Luau scripting, Rojo sync configurations, replication safety, and performance optimization. Use when the user requests Roblox-specific game loops, Client-Server RemoteEvent/RemoteFunction networking, Datastore management, or Rojo projects synchronization."
version: 1.0.0
---

# Roblox Engineer (LITE)

## SOLVE Step 2: GROUND (Roblox Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Rojo project configuration file is active | `cat default.project.json` | ... | Y/N |
| Project-specific tech stack and profile configurations are active | `cat .forgewright/project-profile.json` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Roblox Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Validate client-server RemoteEvents, replication logic, and Rojo directory partition maps | Ensure that net events validate client parameters and are partitioned under ServerScriptService vs ReplicatedStorage.
2. CONSTRUCT | Author Luau scripts utilizing modern structural syntax, object-pooling, or state machines | Confirm frame-independent calculations run inside `RunService.RenderStepped` or `RunService.Heartbeat` loops.
3. TEST | Execute automated unit tests using TestEZ CLI frameworks or local runner scripts | Ensure testing assertions resolve cleanly with zero errors before Rojo project compilation.
4. SYNC | Propagate game assets, script updates, or architectural specs to Obsidian and run sync scripts | Confirm file name compliance (lowercase kebab-case) and establish absolute symlinks to the Shared Obsidian Vault [3, 5].

## Common Mistakes Checklist
- **Client-Authoritative Server Actions**: Trusting client payloads inside `RemoteEvents` or `RemoteFunctions` (e.g., allowing clients to specify damage amounts or purchase items without server validation).
- **Ignoring RunService Delta-Time (Frame-rate dependence)**: Writing physics-based translations, custom lerps, or lerp-based animations inside `Heartbeat` or `RenderStepped` loops without scaling by the delta-time parameter.
- **Memory leaks from dangling Event Connections**: Neglecting to disconnect RBXScriptConnections (like `.Touched`, `:GetPropertyChangedSignal`, or RemoteEvent handlers) on instance destruction, causing severe memory leaks.
- **Non-Compliant File Names**: Storing design document specs or gameplay system notes under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/01-product/PlayerDatastore.md` instead of `docs/01-product/player-datastore.md`).

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Ground the Roblox Rojo workspace settings
```bash
cat .forgewright/project-profile.json
cat default.project.json | grep -E "(name|tree)" -A 3
```
```json
  "name": "forgewright-roblox-battle",
  "tree": {
    "$className": "DataModel",
    "ReplicatedStorage": {
      "$path": "src/shared"
```

### Step 2: Implement a server-authoritative, secure RemoteEvent handler in Luau (`src/server/damage-handler.server.luau`)
```luau
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local NetworkFolder = ReplicatedStorage:WaitForChild("Network")
local DamageEvent = NetworkFolder:WaitForChild("ApplyDamage") :: RemoteEvent

-- Server-Authoritative Damage Verification
local function onDamageRequested(player: Player, targetCharacter: Model)
	local playerCharacter = player.Character
	if not playerCharacter or not targetCharacter then return end
	
	local playerHumanoidRoot = playerCharacter:FindFirstChild("HumanoidRootPart") :: BasePart
	local targetHumanoid = targetCharacter:FindFirstChildOfClass("Humanoid")
	local targetHumanoidRoot = targetCharacter:FindFirstChild("HumanoidRootPart") :: BasePart
	
	if playerHumanoidRoot and targetHumanoid and targetHumanoidRoot then
		-- Guard: Verify distance to prevent exploitation/teleportation attacks
		local distance = (playerHumanoidRoot.Position - targetHumanoidRoot.Position).Magnitude
		if distance <= 15 then -- Max combat reach constraint
			targetHumanoid:TakeDamage(25) -- Authoritative damage calculation
			print("[DAMAGE] Authoritative hit validated for player: " .. player.Name)
		else
			warn("[SECURITY] Exploitation warning: Player " .. player.Name .. " attempted out-of-range hit.")
		end
	end
end

DamageEvent.OnServerEvent:Connect(onDamageRequested)
```

