---
name: unity-multiplayer
description: "Orchestrates Unity-specific multiplayer networking implementations, client-server synchronization, RPC routing, NetworkVariables, and network architecture alignments. Use when the user requests multiplayer features, Netcode for GameObjects (NGO) integrations, custom transport layers, dedicated server setups, or real-time state synchronization."
version: 1.0.0
---

# Unity Multiplayer (LITE)

## SOLVE Step 2: GROUND (Unity Multiplayer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target multiplayer networking library (NGO, Mirror, Photon) is configured in dependencies | `cat Packages/manifest.json \| grep -E "(netcode\|mirror\|photon)"` | ... | Y/N |
| Master NetworkManager configuration and entry points are initialized | `find Assets/ -name "*NetworkManager*" -o -name "*NetworkManager*.asset"` | ... | Y/N |

## SOLVE Step 3: DECOMPOSE (Unity Multiplayer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Validate client-server network topologies and latency mitigation settings | Ensure transport layer settings (e.g., UTP, WebSockets), connection timeout bounds, and maximum client limits are configured.
2. SYNCHRONIZE | Author C# NetworkBehaviours utilizing ServerRpc and ClientRpc protocols | Verify that ServerRpcs validate input client parameters to prevent unauthorized state manipulation.
3. OPTIMIZE | Configure NetworkVariable replication rates and interpolation parameters | Ensure high-frequency position synchronizations utilize interpolation to prevent client-side jitter while maintaining low bandwidth footprints.
4. SYNC | Document multiplayer structures and export kebab-case logs to Obsidian | Run standard post-skill sync scripts to establish absolute symlinks for documentation.

## Common Mistakes Checklist
- **Client-Authoritative State Manipulation**: Allowing clients to set their own positions, health values, or inventory states directly instead of executing authoritative ServerRpc calculations, opening the system to cheating.
- **High-Frequency RPC Spamming**: Invoking high-overhead ServerRpc actions inside high-frequency lifecycle methods (like `Update()` or `FixedUpdate()`) without throttling, resulting in immediate packet loss.
- **Dangling Network Events**: Neglecting to unsubscribe local callback delegates from `NetworkVariable.OnValueChanged` or `OnNetworkDespawn` handlers on asset destruction, leading to memory leaks and invalid callback execution.
- **Non-Compliant Documentation Layout**: Saving multiplayer architecture specs or lobby topologies under `docs/` using CamelCase, spaces, or uppercase letters instead of strictly lowercase kebab-case.

## Worked Example
> [!NOTE]
> The following example is illustrative.

### Step 1: Verify the Netcode package dependency
```bash
cat Packages/manifest.json | grep -E "netcode"
```

