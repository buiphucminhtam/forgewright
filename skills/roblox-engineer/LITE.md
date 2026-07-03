---
name: roblox-engineer
description: "Orchestrates Roblox game engine setups, Luau scripting, Rojo sync configurations, replication safety, and performance optimization. Use when the user requests Roblox-specific game loops, Client-Server RemoteEvent/RemoteFunction networking, Datastore management, or Rojo projects synchronization."
version: 1.0.0
---

# Roblox Engineer (LITE)

## SOLVE Step 2: GROUND (Roblox Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Rojo project configuration file is active | `cat default.project.json` | Verifies the partition trees, project names, and sync behaviors | [1] |
| Project-specific tech stack and profile configurations are active | `cat .forgewright/project-profile.json` | JSON mapping with active Roblox and Luau requirements | [2] |
| Standard feature specs and BDD-first templates exist | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional BDD specs | [3] |
| Token budgets and spending ceilings are configured | `cat .forgewright/budget.yaml` | Displays session cost bounds to limit automated operations | [4] |

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
- **Non-Compliant File Names**: Storing design document specs or gameplay system notes under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/01-product/PlayerDatastore.md` instead of `docs/01-product/player-datastore.md`) [3].
- **Unverified API spending**: Initiating high-frequency loop generations or massive Luau script translations without validating cost boundaries inside `.forgewright/budget.yaml` [4].

## Worked Example

### Step 1: Ground the Roblox Rojo workspace settings
```bash
cat .forgewright/project-profile.json
cat default.project.json | grep -E "(name|tree)" -A 3
```
Output:
```json
{
  "project_name": "forgewright-roblox-battle",
  "tech_stack": ["Roblox", "Luau", "Rojo"],
  "health_status": "PASS"
}
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

### Step 3: Compile and sync Rojo build targets, then document the specification
```bash
# Run local Rojo compiler to update Roblox Place binary
rojo build --output build.rbxl

# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/01-product/combat-replication-spec.md
# Feature: Server-Authoritative Combat Verification

## 1. Executive Summary
Responsive combat interaction system enforcing strict distance validation on the server to prevent hacking.

## 2. Technical Profile
- Engine: Roblox (Luau)
- Sync System: Rojo mapping (src/shared -> ReplicatedStorage)
- Safety Gate: Max reach set to 15 studs. Verified distance calculation inside OnServerEvent callback.
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for combat-replication-spec.md [3].
[SUCCESS] Symlinked docs/01-product/combat-replication-spec.md to /workspace/shared-obsidian-vault/forgewright/01-product/combat-replication-spec.md [5].
```
