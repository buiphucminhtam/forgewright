---
name: physics-engineer
description: "Expert in game physics engines, rigidbodies, colliders, framerate-independent calculations, raycasting, collision matrices, and physics optimization. Use when the user requests character movement, force applications, collision sweeps, raycasts, or collision layers setup."
version: 1.0.0
---

# Physics Engineer (LITE)

## SOLVE Step 2: GROUND (Physics Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Engine's gravity and physics delta-time parameters are known | Check project settings / `which` engine | Identifies base physics rate (e.g. 50Hz, 60Hz) | |
| Collision matrix configuration is documented | Read `physics-matrix.md` or editor settings | Identifies active collision layers and masks | |
| Rigidbody types (Dynamic, Kinematic, Static) are assigned correctly | Verify component definitions in code | Ensures proper collision event response | |

## SOLVE Step 3: DECOMPOSE (Physics Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. CONFIG | Set up collision layers, masks, and global gravity settings | Verify matrix in project configuration.
2. COLLIDER | Assign primitive or compound colliders to target bodies | Verify bounding boxes do not trigger overlap bugs.
3. CODE | Implement physics updates inside fixed-rate update loop using delta multipliers | Ensure framerate independent updates in `FixedUpdate` or `_physics_process(delta)`.
4. OPTIMIZE | Enable sleep thresholds and Continuous Collision Detection (CCD) for fast objects | Verify no object tunneling at speed.

## Common Mistakes Checklist
- **Update Loop Physics**: Writing physics calculations or custom movement inside standard update tick loops (`Update` / `_process`) instead of fixed rate ticks (`FixedUpdate` / `_physics_process`).
- **Missing Delta Multiplying**: Accumulating forces or velocity transitions without multiplying by the fixed delta step.
- **Unconstrained Character Controller Rotation**: Forgetting to lock rotation axes (X, Z) on character bodies, causing them to fall over when hitting obstacles.
- **Raycast Performance Degradation**: Executing raycasts with infinite length and without specifying target layer masks.

## Worked Example

### Unity C# Framerate-Independent Movement
```csharp
using UnityEngine;

[RequireComponent(typeof(Rigidbody))]
public class PhysicsMovement : MonoBehaviour
{
    public float speed = 5f;
    public float jumpForce = 7f;
    private Rigidbody rb;
    private Vector2 inputVector;
    private bool shouldJump = false;

    void Awake()
    {
        rb = GetComponent<Rigidbody>();
        // Constrain X/Z rotations to prevent character from tipping over
        rb.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;
    }

    void Update()
    {
        // Read input in Update (ensures no missed presses)
        inputVector.x = Input.GetAxisRaw("Horizontal");
        inputVector.y = Input.GetAxisRaw("Vertical");
        if (Input.GetButtonDown("Jump")) shouldJump = true;
    }

    void FixedUpdate()
    {
        // Apply physics calculations in FixedUpdate
        Vector3 moveDir = new Vector3(inputVector.x, 0f, inputVector.y).normalized;
        rb.MovePosition(rb.position + moveDir * speed * Time.fixedDeltaTime);

        if (shouldJump)
        {
            rb.AddForce(Vector3.up * jumpForce, ForceMode.Impulse);
            shouldJump = false;
        }
    }
}
```
