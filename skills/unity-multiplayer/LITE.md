---
name: unity-multiplayer
description: "Orchestrates Unity-specific multiplayer networking implementations, client-server synchronization, RPC routing, NetworkVariables, and network architecture alignments. Use when the user requests multiplayer features, Netcode for GameObjects (NGO) integrations, custom transport layers, dedicated server setups, or real-time state synchronization."
version: 1.0.0
---

# Unity Multiplayer (LITE)

## SOLVE Step 2: GROUND (Unity Multiplayer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target multiplayer networking library (NGO, Mirror, Photon) is configured in dependencies | `cat Packages/manifest.json \| grep -E "(netcode\|mirror\|photon)"` | Identifies active network library and version configurations | |
| Master NetworkManager configuration and entry points are initialized | `find Assets/ -name "*NetworkManager*" -o -name "*NetworkManager*.asset"` | Locates the primary network manager settings and serialized managers | |
| Standardized product specification or testing templates are active | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional BDD specs | |
| Active API expenditure parameter boundaries are configured | `cat .forgewright/budget.yaml` | Verifies cost parameters and safety caps prior to automated operations | |

## SOLVE Step 3: DECOMPOSE (Unity Multiplayer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Validate client-server network topologies and latency mitigation settings | Ensure transport layer settings (e.g., UTP, WebSockets), connection timeout bounds, and maximum client limits are configured.
2. SYNCHRONIZE | Author C# NetworkBehaviours utilizing ServerRpc and ClientRpc protocols | Verify that ServerRpcs validate input client parameters to prevent unauthorized state manipulation.
3. OPTIMIZE | Configure NetworkVariable replication rates and interpolation parameters | Ensure high-frequency position synchronizations utilize interpolation to prevent client-side jitter while maintaining low bandwidth footprints.
4. SYNC | Document multiplayer structures and export kebab-case logs to Obsidian | Run standard post-skill sync scripts to establish absolute symlinks for documentation.

## Common Mistakes Checklist
- **Client-Authoritative State Manipulation**: Allowing clients to set their own positions, health values, or inventory states directly instead of executing authoritative ServerRpc calculations, opening the system to cheating.
- **Unbounded Serialization Payload size**: Attempting to sync heavy objects or non-serialized structs over NetworkVariables without implementing custom writing/reading serialization overrides (e.g., `INetworkSerializeByMemcpy`).
- **High-Frequency RPC Spamming**: Invoking high-overhead ServerRpc actions inside high-frequency lifecycle methods (like `Update()` or `FixedUpdate()`) without throttling, resulting in immediate packet loss.
- **Dangling Network Events**: Neglecting to unsubscribe local callback delegates from `NetworkVariable.OnValueChanged` or `OnNetworkDespawn` handlers on asset destruction, leading to memory leaks and invalid callback execution.
- **Non-Compliant Documentation Layout**: Saving multiplayer architecture specs or lobby topologies under `docs/` using CamelCase, spaces, or uppercase letters instead of strictly lowercase kebab-case.

## Worked Example

### Step 1: Verify the Netcode package dependency
```bash
cat Packages/manifest.json | grep -E "netcode"
```
Output:
```json
    "com.unity.netcode.gameobjects": "1.8.0"
```

### Step 2: Implement a server-authoritative position sync script in `src/multiplayer/PlayerNetworkMovement.cs`
```csharp
using Unity.Netcode;
using UnityEngine;

namespace Forgewright.Multiplayer
{
    public class PlayerNetworkMovement : NetworkBehaviour
    {
        // Enforce Server Authoritative position sync via NetworkVariable
        private readonly NetworkVariable<Vector3> netPosition = new(
            writePerm: NetworkVariableWritePermission.Server,
            readPerm: NetworkVariableReadPermission.Everyone
        );

        [SerializeField] private float moveSpeed = 5f;

        public override void OnNetworkSpawn()
        {
            if (IsOwner)
            {
                Debug.Log("[NETCODE] Spawned local authoritative player controller.");
            }
        }

        private void Update()
        {
            if (IsOwner)
            {
                // Send inputs to server for validation and execution
                MoveInputServerRpc(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
            }
            
            if (!IsOwner)
            {
                // Smoothly interpolate position on remote clients to avoid stutter
                transform.position = Vector3.Lerp(transform.position, netPosition.Value, Time.deltaTime * 10f);
            }
        }

        [ServerRpc]
        private void MoveInputServerRpc(float horizontal, float vertical)
        {
            // Server calculates positions authoritatively
            Vector3 movement = new Vector3(horizontal, 0f, vertical).normalized * moveSpeed * Time.deltaTime;
            transform.position += movement;
            netPosition.Value = transform.position; // Automatically replicates to all clients
        }
    }
}
```

### Step 3: Document structural specifications and synchronize to Obsidian
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/01-product/multiplayer-movement-spec.md
# Feature: Server-Authoritative Network Movement

## 1. Executive Summary
Provide a stutter-free, server-authoritative player movement synchronization layer using NGO.

## 2. Technical Profile
- Framework: Netcode for GameObjects
- Write Permission: Server-Only
- Bandwidth Management: Vector3 interpolation with a target replication rate of 30Hz.
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for multiplayer-movement-spec.md.
[SUCCESS] Symlinked docs/01-product/multiplayer-movement-spec.md to /workspace/shared-obsidian-vault/forgewright/01-product/multiplayer-movement-spec.md.
```
