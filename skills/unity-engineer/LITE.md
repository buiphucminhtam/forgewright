---
name: unity-engineer
description: "Orchestrates Unity-specific visual and logical systems, C# script development, component lifecycles, and physics simulation triggers. Use when the user requests gameplay logic, script creation, Unity project setup, asset integrations, or scene object configurations."
version: 1.0.0
---

# Unity Engineer (LITE)

## SOLVE Step 2: GROUND (Unity Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Project tech stack matches Unity and C# guidelines [1] | `cat .forgewright/project-profile.json` | JSON mapping with Unity engine configurations [1] | |
| Active C# solution or assembly definition files exist [2] | `find . -name "*.sln" -o -name "*.asmdef"` | Lists paths to Unity solution and project assemblies [2] | |
| Standard feature spec templates are present for BDD planning [3] | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional BDD specs [3] | |
| Token expenditure thresholds and budget boundaries are active [4, 5] | `cat .forgewright/budget.yaml` | Displays configured spend limits to restrict autonomous operations [5] | |

## SOLVE Step 3: DECOMPOSE (Unity Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. INSPECT | Verify game scene hierarchies, active component structures, and `.meta` files | Ensure there are no broken references, unassigned GameObject serialized fields, or orphaned assets.
2. IMPLEMENT | Author or refine C# scripts using solid architecture standards and namespaces | Confirm that update loops do not run heavy calculations or direct garbage-collecting allocations.
3. COMPILE | Execute local MSBuild compilation sweeps or runner checks on active components | Verify compilation completes successfully with zero warnings or structural syntax failures.
4. SYNC | Document execution patterns and save kebab-case log specs to the Shared Obsidian Vault [3, 6, 7] | Trigger standard post-skill sync scripts to establish absolute symlinks for documentation [7].

## Common Mistakes Checklist
- **Unassigned Serialized Fields**: Forgetting to link serializable fields (`SerializeField`) in scene assets, leading to `NullReferenceException` blocks during runtime.
- **Garbage Generation in Update Loops**: Creating new class instances, calling `.GetComponent()`, or triggering heavy string concatenations in high-frequency `Update()` loops.
- **Ignoring .meta File Hygiene**: Renaming or moving script assets via terminal commands without updating or moving their corresponding `.meta` files, corrupting Unity engine serializations.
- **Non-compliant Filenames**: Storing logs, specs, or GDD layouts under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `unity-physics-setup.md`) [3].
- **Unchecked API Spending**: Launching large procedural asset or script generation sweeps without checking token expenditure ceilings in `.forgewright/budget.yaml` [4, 5].

## Worked Example

### Step 1: Ground the active development platform
```bash
cat .forgewright/project-profile.json
```
Output:
```json
{
  "project_name": "forgewright-unity-quest",
  "tech_stack": ["Unity", "C#", "Netcode"],
  "health_status": "PASS"
}
```

### Step 2: Implement a clean, garbage-recycled player controller in `src/scripts/PlayerController.cs`
```csharp
using UnityEngine;

namespace Forgewright.Core
{
    public class PlayerController : MonoBehaviour
    {
        [SerializeField] private float moveSpeed = 5.0f;
        
        private Rigidbody rb;
        private Vector3 movementInput;

        private void Awake()
        {
            // Ground caching components during initialization to avoid GC overhead
            rb = GetComponent<Rigidbody>();
        }

        private void Update()
        {
            // Optimized: Recycles input variables and avoids allocations in high-frequency update
            float horizontal = Input.GetAxisRaw("Horizontal");
            float vertical = Input.GetAxisRaw("Vertical");
            movementInput = new Vector3(horizontal, 0f, vertical).normalized;
        }

        private void FixedUpdate()
        {
            if (movementInput.sqrMagnitude > 0.01f)
            {
                rb.MovePosition(rb.position + movementInput * moveSpeed * Time.fixedDeltaTime);
            }
        }
    }
}
```

### Step 3: Run the project synchronization workflow
```bash
# Save design spec using compliant lowercase kebab-case naming
cat << 'EOF' > docs/01-product/player-movement-specs.md
# Feature: Responsive 3D Player Movement

## 1. Executive Summary
Responsive C# based Rigidbody movement control loop avoiding GC overhead in high frequency updates.

## 2. Technical Profile
- Engine: Unity 3D
- Physics: Rigidbody kinematic interpolation
- GC Rules: Cache components on Awake to preserve high frame rates.
EOF

# Execute standard post-skill sync hook
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Symlinked docs/01-product/player-movement-specs.md to /workspace/shared-obsidian-vault/forgewright/01-product/player-movement-specs.md.
```
