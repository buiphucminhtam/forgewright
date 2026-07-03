using UnityEngine;

namespace Forgewright.Gameplay
{
    /// <summary>
    /// Professional, frame-rate independent custom projectile simulation for Unity.
    /// Uses manual integration + raycast sweep checks to guarantee collision registration at high speeds (prevent tunneling).
    /// </summary>
    public class ProjectileUnity : MonoBehaviour
    {
        [Header("Movement")]
        [SerializeField] private float initialSpeed = 40f;
        [SerializeField] private float gravityScale = 0.5f;
        [SerializeField] private float dragCoefficient = 0.05f;

        [Header("Collision")]
        [SerializeField] private LayerMask collisionLayers;
        [SerializeField] private float radius = 0.1f;
        [SerializeField] private int maxPenetrationPasses = 3;

        [Header("Lifetime")]
        [SerializeField] private float maxLifetime = 5f;

        private Vector3 position;
        private Vector3 velocity;
        private float elapsedLifetime = 0f;

        public delegate void HitEventHandler(RaycastHit hit);
        public event HitEventHandler OnHitRegistered;

        public void Initialize(Vector3 startPosition, Vector3 direction)
        {
            position = startPosition;
            velocity = direction.normalized * initialSpeed;
            transform.position = position;
            if (velocity != Vector3.zero)
            {
                transform.rotation = Quaternion.LookRotation(velocity);
            }
        }

        private void Start()
        {
            if (velocity == Vector3.zero)
            {
                Initialize(transform.position, transform.forward);
            }
        }

        private void Update()
        {
            // Update visual transform inside normal frame update (interpolated position)
            transform.position = position;
            if (velocity != Vector3.zero)
            {
                transform.rotation = Quaternion.LookRotation(velocity);
            }
        }

        private void FixedUpdate()
        {
            float dt = Time.fixedDeltaTime;
            elapsedLifetime += dt;

            if (elapsedLifetime >= maxLifetime)
            {
                DestroySelf();
                return;
            }

            // 1. Calculate physical forces (Gravity & Air Drag)
            Vector3 dragForce = -velocity.normalized * (velocity.sqrMagnitude * dragCoefficient * 0.5f);
            Vector3 gravityForce = Physics.gravity * gravityScale;

            velocity += (gravityForce + dragForce) * dt;

            // 2. Perform SphereCast sweep collision detection (prevent tunneling)
            Vector3 movementThisFrame = velocity * dt;
            float movementMagnitude = movementThisFrame.magnitude;

            if (movementMagnitude > 0.001f)
            {
                Ray sweepRay = new Ray(position, movementThisFrame);
                RaycastHit hit;

                // SphereCast has physical volume, Raycast is infinite line width. We use SphereCast for projectiles.
                if (Physics.SphereCast(sweepRay, radius, out hit, movementMagnitude, collisionLayers))
                {
                    // Handle Hit logic
                    OnHit(hit);
                    return;
                }
            }

            // 3. Update simulation coordinates
            position += movementThisFrame;
        }

        private void OnHit(RaycastHit hit)
        {
            // Align position to exact impact point
            position = hit.point;
            
            // Emit event for hook ins (e.g. damage calculations, impact particles)
            OnHitRegistered?.Invoke(hit);

            // Create impact decals / particles (mock or reference logic here)
            Debug.Log($"Projectile hit object: {hit.collider.name} at {hit.point}");

            DestroySelf();
        }

        private void DestroySelf()
        {
            Destroy(gameObject);
        }

        private void OnDrawGizmosSelected()
        {
            Gizmos.color = Color.red;
            Gizmos.DrawWireSphere(transform.position, radius);
        }
    }
}
