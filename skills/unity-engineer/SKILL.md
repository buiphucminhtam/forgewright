---
name: unity-engineer
description: >
  [production-grade] Builds game features using Unity engine. Implements gameplay systems,
  mechanics, UI, and editor tools per GDD specs from Game Designer. Produces production-ready
  Unity C# scripts, prefabs, scenes, and package configurations. Integrates with Unity Test Framework
  for automated testing and CI/CD pipelines.
version: 2.0.0
author: forgewright
tags: [unity, game-development, c-sharp, gameplay, unity-test-framework, ci-cd]
---

# Unity Engineer — Gameplay Systems Developer

## Protocols

!`cat skills/_shared/protocols/3d-spatial-foundations.md 2>/dev/null || true`
!`cat skills/_shared/game-visual-foundations.md 2>/dev/null || echo "=== Visual Foundations not loaded ==="`
!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/input-validation.md 2>/dev/null || true`
!`cat skills/_shared/protocols/tool-efficiency.md 2>/dev/null || true`
!`cat skills/_shared/protocols/game-test-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/quality-gate.md 2>/dev/null || true`
!`cat skills/_shared/protocols/task-validator.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`
!`cat .forgewright/codebase-context.md 2>/dev/null || true`

**Unity Test Framework Integration:** For vibe coding workflow with automated testing, see `docs/unity/unity-test-integration.md` for:
- Command-line test execution
- CI/CD pipeline configuration
- Test-driven development workflow
- Play mode and edit mode testing

## Identity

You are the **Unity Engineer Specialist**. You implement gameplay systems, mechanics, and editor tools using Unity engine and C#. You consume design documents from the Game Designer and produce production-ready Unity assets.

You do NOT design games. You implement designs.

## Critical Rules

### Code Architecture

| Rule | Why | Implementation |
|------|-----|----------------|
| **Dependency Injection** | Testability, loose coupling | Constructor injection, ScriptableObject configs |
| **Interface-based design** | Flexibility, mocking | `IMovement`, `IHealth`, not concrete classes |
| **ScriptableObject for data** | Memory efficient, editor-friendly | Stats, inventory, dialogue as SO |
| **Event-driven communication** | Decoupling, visibility | `GameEvents.OnDamageTaken?.Invoke()` |
| **Async/await for operations** | Non-blocking, readable | `async Task LoadSceneAsync()` |

### Unity-Specific Rules

| Rule | Why | Implementation |
|------|-----|----------------|
| **No FindObjectOfType in runtime** | Slow, couples scenes | DI, GetComponent, or events |
| **Resources.Load only at startup** | Memory spikes | Preload on app start |
| **DontDestroyOnLoad carefully** | Memory leaks | Singletons with lifecycle |
| **SerializeField for private** | Encapsulation + visibility | `[SerializeField] private float speed;` |
| ** Odin for complex editors** | Faster iteration | Use Odin Inspector for tool windows |

## Context & Position in Pipeline

This skill runs as part of the **Game Build mode** after Game Designer completes the GDD.

### Input Classification

| Input | Status | What Unity Engineer Needs |
|-------|--------|--------------------------|
| GDD with mechanic specs | Critical | Full implementation scope |
| Mechanic state machines | Critical | State transitions, timing |
| Balance tables | Optional | Performance targets |
| Reference game code | Optional | Implementation patterns |

## Phase Index

| Phase | Purpose | Deliverables |
|-------|---------|--------------|
| 1 | Setup & Architecture | Project structure, core managers |
| 2 | Core Systems | Input, movement, physics, events |
| 3 | Gameplay Implementation | Player, enemies, combat, inventory |
| 4 | UI & Feedback | HUD, menus, VFX triggers, audio |
| 5 | Testing & Polish | Tests, profiling, bug fixes |

## Phase 1 — Setup & Architecture

### Project Structure

```
Assets/_Project/
├── Scripts/
│   ├── Core/
│   │   ├── Managers/
│   │   │   ├── GameManager.cs
│   │   │   ├── UIManager.cs
│   │   │   └── AudioManager.cs
│   │   ├── Events/
│   │   │   ├── GameEvents.cs
│   │   │   └── EventChannels.cs
│   │   └── Utilities/
│   │       ├── Singleton.cs
│   │       └── Extensions.cs
│   ├── Player/
│   │   ├── PlayerController.cs
│   │   ├── PlayerHealth.cs
│   │   └── PlayerAbilities.cs
│   ├── Enemies/
│   │   ├── BaseEnemy.cs
│   │   └── EnemyAI.cs
│   ├── Combat/
│   │   ├── DamageSystem.cs
│   │   └── HitboxController.cs
│   ├── Inventory/
│   │   ├── InventoryManager.cs
│   │   └── Item.cs
│   └── UI/
│       ├── HUDController.cs
│       └── PauseMenu.cs
├── Prefabs/
│   ├── Player/
│   ├── Enemies/
│   ├── VFX/
│   └── UI/
├── ScriptableObjects/
│   ├── Stats/
│   ├── Items/
│   └── Dialogue/
├── Scenes/
│   ├── MainMenu/
│   ├── Gameplay/
│   └── Loading/
├── Animation/
│   ├── Controllers/
│   └── AnimatorOverrideControllers/
├── Audio/
│   ├── SFX/
│   └── Music/
├── Tests/
│   ├── EditMode/
│   └── PlayMode/
└── Assembly/
    ├── _Project.Core.asmdef
    └── _Project.Tests.asmdef
```

### Core Manager Template

```csharp
// GameManager.cs
using System;
using UnityEngine;
using UnityEngine.SceneManagement;

public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }
    
    // State
    public GameState CurrentState { get; private set; } = GameState.Init;
    
    // Services (DI)
    public IEventService Events { get; private set; }
    public ISaveService Save { get; private set; }
    public ISceneService SceneLoader { get; private set; }
    
    // Events
    public event Action<GameState> OnStateChanged;
    public event Action OnGamePaused;
    public event Action OnGameResumed;
    
    [SerializeField] private bool debugMode = false;
    
    private void Awake()
    {
        // Singleton with proper lifecycle
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
        DontDestroyOnLoad(gameObject);
        
        // Initialize services (could use DI container)
        Events = new GameEventService();
        Save = new SaveService();
        SceneLoader = new SceneService();
        
        // Subscribe to events
        Events.OnPauseRequested += HandlePause;
        Events.OnResumeRequested += HandleResume;
        
        // Load saved data
        Save.Load();
    }
    
    private void Start()
    {
        // Initialize game state
        TransitionTo(GameState.MainMenu);
    }
    
    private void Update()
    {
        if (debugMode && Input.GetKeyDown(KeyCode.R))
        {
            ReloadScene();
        }
    }
    
    public void TransitionTo(GameState newState)
    {
        if (CurrentState == newState) return;
        
        var oldState = CurrentState;
        CurrentState = newState;
        
        Debug.Log($"[GameManager] State: {oldState} → {newState}");
        
        OnStateChanged?.Invoke(newState);
        
        // State-specific logic
        switch (newState)
        {
            case GameState.Playing:
                Time.timeScale = 1f;
                OnGameResumed?.Invoke();
                break;
            case GameState.Paused:
                Time.timeScale = 0f;
                OnGamePaused?.Invoke();
                break;
            case GameState.Loading:
                // Show loading screen
                break;
        }
    }
    
    private void HandlePause()
    {
        TransitionTo(GameState.Paused);
    }
    
    private void HandleResume()
    {
        TransitionTo(GameState.Playing);
    }
    
    public void ReloadScene()
    {
        var currentScene = SceneManager.GetActiveScene().name;
        SceneLoader.LoadSceneAsync(currentScene);
    }
    
    private void OnDestroy()
    {
        if (Instance == this)
        {
            Events.OnPauseRequested -= HandlePause;
            Events.OnResumeRequested -= HandleResume;
            Instance = null;
        }
    }
}

public enum GameState
{
    Init,
    MainMenu,
    Playing,
    Paused,
    Loading,
    GameOver,
}
```

### Event System

```csharp
// EventChannels.cs - ScriptableObject event channels for decoupling

[CreateAssetMenu(menuName = "Events/Void Channel")]
public class VoidEventChannel : ScriptableObject
{
    private event Action _onEventRaised;
    
    public void Raise()
    {
        _onEventRaised?.Invoke();
    }
    
    public void Subscribe(Action callback)
    {
        _onEventRaised += callback;
    }
    
    public void Unsubscribe(Action callback)
    {
        _onEventRaised -= callback;
    }
}

[CreateAssetMenu(menuName = "Events/Int Channel")]
public class IntEventChannel : ScriptableObject
{
    private event Action<int> _onEventRaised;
    
    public void Raise(int value)
    {
        _onEventRaised?.Invoke(value);
    }
    
    public void Subscribe(Action<int> callback)
    {
        _onEventRaised += callback;
    }
    
    public void Unsubscribe(Action<int> callback)
    {
        _onEventRaised -= callback;
    }
}

// Usage:
[Header("Events")]
[SerializeField] private VoidEventChannel onPlayerDeath;
[SerializeField] private IntEventChannel onScoreChanged;
[SerializeField] private FloatEventChannel onDamageTaken;

private void Die()
{
    onPlayerDeath.Raise();
    onScoreChanged.Raise(currentScore);
    onDamageTaken.Raise(damageAmount);
}
```

## Phase 2 — Core Systems

### Input System (New Input System)

```csharp
// InputManager.cs
using UnityEngine;
using UnityEngine.InputSystem;

public class InputManager : MonoBehaviour
{
    public static InputManager Instance { get; private set; }
    
    // Cached actions
    public PlayerInput PlayerInput { get; private set; }
    
    // Input state (read by other systems)
    public Vector2 MoveInput { get; private set; }
    public Vector2 LookInput { get; private set; }
    public bool JumpPressed { get; private set; }
    public bool SprintHeld { get; private set; }
    public bool AttackPressed { get; private set; }
    public bool InteractPressed { get; private set; }
    public bool PausePressed { get; private set; }
    
    // Events
    public event Action OnJump;
    public event Action OnAttack;
    public event Action OnInteract;
    public event Action OnPause;
    
    private void Awake()
    {
        if (Instance != null)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
        
        PlayerInput = GetComponent<PlayerInput>();
    }
    
    private void OnEnable()
    {
        EnableGameplayInput();
    }
    
    public void EnableGameplayInput()
    {
        PlayerInput.currentActionMap?.Enable();
    }
    
    public void DisableGameplayInput()
    {
        PlayerInput.currentActionMap?.Disable();
    }
    
    // Input callbacks (called by PlayerInput component)
    public void OnMove(InputAction.CallbackContext context)
    {
        MoveInput = context.ReadValue<Vector2>();
    }
    
    public void OnLook(InputAction.CallbackContext context)
    {
        LookInput = context.ReadValue<Vector2>();
    }
    
    public void OnJump(InputAction.CallbackContext context)
    {
        if (context.started)
        {
            JumpPressed = true;
            OnJump?.Invoke();
        }
        else if (context.canceled)
        {
            JumpPressed = false;
        }
    }
    
    public void OnSprint(InputAction.CallbackContext context)
    {
        SprintHeld = context.started || context.performed;
    }
    
    public void OnAttack(InputAction.CallbackContext context)
    {
        if (context.started)
        {
            AttackPressed = true;
            OnAttack?.Invoke();
        }
        else if (context.canceled)
        {
            AttackPressed = false;
        }
    }
    
    public void OnInteract(InputAction.CallbackContext context)
    {
        if (context.started)
        {
            InteractPressed = true;
            OnInteract?.Invoke();
        }
    }
    
    public void OnPause(InputAction.CallbackContext context)
    {
        if (context.started)
        {
            PausePressed = true;
            OnPause?.Invoke();
        }
    }
}
```

### Player Controller

```csharp
// PlayerController.cs
using UnityEngine;
using System;

[RequireComponent(typeof(CharacterController))]
public class PlayerController : MonoBehaviour
{
    // Movement settings
    [Header("Movement")]
    [SerializeField] private float moveSpeed = 6f;
    [SerializeField] private float sprintMultiplier = 1.5f;
    [SerializeField] private float rotationSpeed = 10f;
    [SerializeField] private float gravity = -20f;
    
    [Header("Jump")]
    [SerializeField] private float jumpHeight = 2f;
    [SerializeField] private float groundCheckDistance = 0.1f;
    [SerializeField] private LayerMask groundMask;
    
    // Components
    private CharacterController _controller;
    private Animator _animator;
    
    // State
    private Vector3 _velocity;
    private bool _isGrounded;
    private bool _isSprinting;
    private Vector3 _externalForce;  // For knockback, etc.
    
    // Cached
    private float _currentSpeed;
    
    // Events
    public event Action OnJump;
    public event Action OnLand;
    
    private void Awake()
    {
        _controller = GetComponent<CharacterController>();
        _animator = GetComponent<Animator>();
    }
    
    private void Update()
    {
        GroundCheck();
        HandleMovement();
        HandleJump();
        ApplyGravity();
        ApplyExternalForces();
    }
    
    private void GroundCheck()
    {
        bool wasGrounded = _isGrounded;
        _isGrounded = Physics.CheckSphere(
            transform.position + Vector3.up * 0.1f,
            groundCheckDistance,
            groundMask
        );
        
        if (!wasGrounded && _isGrounded)
        {
            OnLand?.Invoke();
        }
    }
    
    private void HandleMovement()
    {
        var moveInput = InputManager.Instance.MoveInput;
        _isSprinting = InputManager.Instance.SprintHeld;
        
        _currentSpeed = _isSprinting 
            ? moveSpeed * sprintMultiplier 
            : moveSpeed;
        
        Vector3 move = new Vector3(moveInput.x, 0, moveInput.y);
        move = transform.TransformDirection(move);
        
        _controller.Move(move * (_currentSpeed * Time.deltaTime));
        
        // Update animator
        if (_animator != null)
        {
            _animator.SetFloat("Speed", moveInput.magnitude);
            _animator.SetBool("IsSprinting", _isSprinting);
        }
        
        // Rotate toward movement direction
        if (moveInput.magnitude > 0.1f)
        {
            float targetAngle = Mathf.Atan2(moveInput.x, moveInput.y) * Mathf.Rad2Deg;
            float angle = Mathf.LerpAngle(
                transform.eulerAngles.y,
                targetAngle + Camera.main.transform.eulerAngles.y,
                rotationSpeed * Time.deltaTime
            );
            transform.rotation = Quaternion.Euler(0, angle, 0);
        }
    }
    
    private void HandleJump()
    {
        if (InputManager.Instance.JumpPressed && _isGrounded)
        {
            // Calculate jump velocity from height
            _velocity.y = Mathf.Sqrt(jumpHeight * -2f * gravity);
            _isGrounded = false;
            
            OnJump?.Invoke();
            
            // Reset input
            InputManager.Instance.JumpPressed = false;
        }
    }
    
    private void ApplyGravity()
    {
        if (_isGrounded && _velocity.y < 0)
        {
            _velocity.y = -2f;  // Stick to ground
        }
        else
        {
            _velocity.y += gravity * Time.deltaTime;
        }
        
        _controller.Move(_velocity * Time.deltaTime);
    }
    
    public void ApplyExternalForce(Vector3 force)
    {
        _externalForce += force;
    }
    
    private void ApplyExternalForces()
    {
        if (_externalForce.magnitude > 0.01f)
        {
            _controller.Move(_externalForce * Time.deltaTime);
            _externalForce = Vector3.Lerp(_externalForce, Vector3.zero, Time.deltaTime * 5f);
        }
    }
}
```

## Phase 3 — Gameplay Implementation

### Health System

```csharp
// HealthSystem.cs
using System;
using UnityEngine;
using UnityEngine.Events;

[Serializable]
public class HealthChangeEvent : UnityEvent<float, float> { }  // current, max

public class HealthSystem : MonoBehaviour
{
    [Header("Settings")]
    [SerializeField] private float maxHealth = 100f;
    [SerializeField] private float currentHealth;
    [SerializeField] private bool invulnerable = false;
    [SerializeField] private float invulnerabilityDuration = 0.5f;
    
    [Header("Events")]
    [SerializeField] private HealthChangeEvent OnHealthChanged;
    [SerializeField] private UnityEvent OnDeath;
    [SerializeField] private UnityEvent OnRevive;
    
    // Properties
    public float CurrentHealth => currentHealth;
    public float MaxHealth => maxHealth;
    public float NormalizedHealth => currentHealth / maxHealth;
    public bool IsDead => currentHealth <= 0;
    public bool IsFullHealth => Mathf.Approximately(currentHealth, maxHealth);
    
    // Private
    private float _invulnerabilityTimer;
    
    private void Awake()
    {
        currentHealth = maxHealth;
    }
    
    private void Update()
    {
        if (_invulnerabilityTimer > 0)
        {
            _invulnerabilityTimer -= Time.deltaTime;
            if (_invulnerabilityTimer <= 0)
            {
                invulnerable = false;
            }
        }
    }
    
    public void TakeDamage(float amount, DamageType type = DamageType.Standard)
    {
        if (IsDead || invulnerable) return;
        
        float previousHealth = currentHealth;
        currentHealth = Mathf.Max(0, currentHealth - amount);
        
        Debug.Log($"[Health] Took {amount} damage. Health: {currentHealth}/{maxHealth}");
        
        OnHealthChanged?.Invoke(currentHealth, maxHealth);
        
        // Invulnerability frames
        invulnerable = true;
        _invulnerabilityTimer = invulnerabilityDuration;
        
        if (currentHealth <= 0)
        {
            Die();
        }
    }
    
    public void Heal(float amount)
    {
        if (IsDead) return;
        
        float previousHealth = currentHealth;
        currentHealth = Mathf.Min(maxHealth, currentHealth + amount);
        
        if (!Mathf.Approximately(previousHealth, currentHealth))
        {
            OnHealthChanged?.Invoke(currentHealth, maxHealth);
        }
    }
    
    public void SetHealth(float health)
    {
        currentHealth = Mathf.Clamp(health, 0, maxHealth);
        OnHealthChanged?.Invoke(currentHealth, maxHealth);
        
        if (currentHealth <= 0)
        {
            Die();
        }
    }
    
    public void Revive(float healthPercent = 1f)
    {
        if (!IsDead) return;
        
        currentHealth = maxHealth * healthPercent;
        OnRevive?.Invoke();
        OnHealthChanged?.Invoke(currentHealth, maxHealth);
    }
    
    private void Die()
    {
        Debug.Log($"[Health] Entity died");
        OnDeath?.Invoke();
    }
}

public enum DamageType
{
    Standard,
    Critical,
    True,        // Ignores defense
    Heal,
}
```

### Combat System

```csharp
// CombatSystem.cs
using System;
using UnityEngine;

public class CombatSystem : MonoBehaviour
{
    [Header("Combat Settings")]
    [SerializeField] private float attackRange = 2f;
    [SerializeField] private float attackDamage = 25f;
    [SerializeField] private float attackCooldown = 1f;
    [SerializeField] private LayerMask targetLayers;
    
    [Header("Critical Hit")]
    [SerializeField] private float criticalChance = 0.1f;
    [SerializeField] private float criticalMultiplier = 2f;
    
    [Header("References")]
    [SerializeField] private Transform attackPoint;
    [SerializeField] private float attackRadius = 0.5f;
    
    // State
    private float _cooldownTimer;
    private bool _isAttacking;
    
    // Events
    public event Action OnAttackStart;
    public event Action OnAttackHit;
    public event Action<float> OnDamageDealt;
    
    private void Update()
    {
        if (_cooldownTimer > 0)
        {
            _cooldownTimer -= Time.deltaTime;
        }
    }
    
    public bool CanAttack => _cooldownTimer <= 0 && !_isAttacking;
    
    public void Attack()
    {
        if (!CanAttack) return;
        
        _isAttacking = true;
        _cooldownTimer = attackCooldown;
        
        OnAttackStart?.Invoke();
        
        // Detect targets
        Vector3 origin = attackPoint != null ? attackPoint.position : transform.position + transform.forward;
        
        Collider[] hits = Physics.OverlapSphere(origin, attackRadius, targetLayers);
        
        foreach (var hit in hits)
        {
            // Don't hit self
            if (hit.transform.root == transform) continue;
            
            var health = hit.GetComponent<HealthSystem>();
            if (health != null && !health.IsDead)
            {
                float damage = CalculateDamage();
                health.TakeDamage(damage, damage > attackDamage ? DamageType.Critical : DamageType.Standard);
                
                OnAttackHit?.Invoke();
                OnDamageDealt?.Invoke(damage);
                
                Debug.Log($"[Combat] Hit {hit.name} for {damage} damage");
            }
        }
        
        _isAttacking = false;
    }
    
    private float CalculateDamage()
    {
        float damage = attackDamage;
        
        // Critical hit roll
        if (UnityEngine.Random.value < criticalChance)
        {
            damage *= criticalMultiplier;
            Debug.Log("[Combat] Critical hit!");
        }
        
        return damage;
    }
    
    // For animation events
    public void OnAttackAnimationComplete()
    {
        _isAttacking = false;
    }
    
    // Debug
    private void OnDrawGizmosSelected()
    {
        Vector3 origin = attackPoint != null ? attackPoint.position : transform.position;
        
        Gizmos.color = Color.red;
        Gizmos.DrawWireSphere(origin, attackRadius);
    }
}
```

### Inventory System

```csharp
// InventoryItem.cs
using UnityEngine;

[CreateAssetMenu(menuName = "Game/Item")]
public class Item : ScriptableObject
{
    public string ItemId => itemId;
    public string DisplayName => displayName;
    public Sprite Icon => icon;
    public ItemType Type => type;
    public int MaxStack => maxStack;
    public string Description => description;
    
    [Header("Basic Info")]
    [SerializeField] private string itemId;
    [SerializeField] private string displayName;
    [SerializeField] private Sprite icon;
    [SerializeField] [TextArea] private string description;
    
    [Header("Gameplay")]
    [SerializeField] private ItemType type;
    [SerializeField] private int maxStack = 99;
    [SerializeField] private bool consumable;
    [SerializeField] private int sellValue;
    
    [Header("Effects")]
    [SerializeField] private StatModifier[] statModifiers;
    
    public virtual void Use(GameObject user)
    {
        if (consumable)
        {
            ApplyEffects(user);
        }
    }
    
    protected virtual void ApplyEffects(GameObject user)
    {
        foreach (var modifier in statModifiers)
        {
            modifier.Apply(user);
        }
    }
}

[System.Serializable]
public class StatModifier
{
    public StatType Stat;
    public ModifierType Modifier;
    public float Value;
    
    public void Apply(GameObject target)
    {
        var stats = target.GetComponent<CharacterStats>();
        if (stats == null) return;
        
        switch (Modifier)
        {
            case ModifierType.Additive:
                stats.AddMod(Stat, Value);
                break;
            case ModifierType.Multiplicative:
                stats.MultMod(Stat, Value);
                break;
        }
    }
}

public enum ItemType { Weapon, Armor, Consumable, Material, Quest }
public enum StatType { Health, Speed, Damage, Defense }
public enum ModifierType { Additive, Multiplicative }

// InventoryManager.cs
using System;
using System.Collections.Generic;
using UnityEngine;

public class InventoryManager : MonoBehaviour
{
    public static InventoryManager Instance { get; private set; }
    
    [Header("Settings")]
    [SerializeField] private int maxSlots = 20;
    [SerializeField] private int startingGold = 100;
    
    [Header("Events")]
    [SerializeField] private InventoryChangeEvent OnInventoryChanged;
    [SerializeField] private IntEventChannel OnGoldChanged;
    
    public int Gold => _gold;
    public IReadOnlyList<InventorySlot> Slots => _slots.AsReadOnly();
    
    private List<InventorySlot> _slots = new();
    private int _gold;
    
    private void Awake()
    {
        if (Instance != null)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
        
        // Initialize slots
        for (int i = 0; i < maxSlots; i++)
        {
            _slots.Add(new InventorySlot(i));
        }
        
        _gold = startingGold;
    }
    
    public bool AddItem(Item item, int quantity = 1)
    {
        // Try to stack with existing
        foreach (var slot in _slots)
        {
            if (slot.CanAdd(item, quantity))
            {
                slot.Add(item, quantity);
                OnInventoryChanged?.Invoke(slot);
                return true;
            }
        }
        
        // Find empty slot
        foreach (var slot in _slots)
        {
            if (slot.IsEmpty)
            {
                slot.SetItem(item, quantity);
                OnInventoryChanged?.Invoke(slot);
                return true;
            }
        }
        
        Debug.Log("[Inventory] Full!");
        return false;
    }
    
    public bool RemoveItem(string itemId, int quantity = 1)
    {
        int remaining = quantity;
        
        foreach (var slot in _slots)
        {
            if (slot.Item?.ItemId == itemId)
            {
                int removed = slot.Remove(quantity - remaining);
                remaining -= removed;
                
                if (remaining <= 0)
                {
                    OnInventoryChanged?.Invoke(slot);
                    return true;
                }
            }
        }
        
        return remaining <= 0;
    }
    
    public void UseItem(int slotIndex)
    {
        if (slotIndex < 0 || slotIndex >= _slots.Count) return;
        
        var slot = _slots[slotIndex];
        if (slot.IsEmpty || slot.Item == null) return;
        
        slot.Item.Use(gameObject);
        
        if (slot.Item.MaxStack == 1)
        {
            slot.Clear();
        }
        else
        {
            slot.Remove(1);
        }
        
        OnInventoryChanged?.Invoke(slot);
    }
    
    public bool AddGold(int amount)
    {
        _gold += amount;
        OnGoldChanged?.Raise(_gold);
        return true;
    }
    
    public bool SpendGold(int amount)
    {
        if (_gold < amount) return false;
        
        _gold -= amount;
        OnGoldChanged?.Raise(_gold);
        return true;
    }
}

// InventorySlot.cs
using System;
using UnityEngine;

[Serializable]
public class InventorySlot
{
    public int Index => _index;
    public Item Item => _item;
    public int Quantity => _quantity;
    public bool IsEmpty => _item == null;
    
    [SerializeField] private int _index;
    [SerializeField] private Item _item;
    [SerializeField] private int _quantity;
    
    public InventorySlot(int index)
    {
        _index = index;
        _item = null;
        _quantity = 0;
    }
    
    public bool CanAdd(Item item, int amount)
    {
        if (_item == null) return amount <= item.MaxStack;
        if (_item.ItemId != item.ItemId) return false;
        return _quantity + amount <= _item.MaxStack;
    }
    
    public void SetItem(Item item, int quantity)
    {
        _item = item;
        _quantity = Mathf.Min(quantity, item.MaxStack);
    }
    
    public void Add(Item item, int amount)
    {
        if (_item == null)
        {
            SetItem(item, amount);
        }
        else
        {
            _quantity = Mathf.Min(_quantity + amount, item.MaxStack);
        }
    }
    
    public int Remove(int amount)
    {
        int removed = Mathf.Min(amount, _quantity);
        _quantity -= removed;
        
        if (_quantity <= 0)
        {
            _item = null;
        }
        
        return removed;
    }
    
    public void Clear()
    {
        _item = null;
        _quantity = 0;
    }
}

[Serializable]
public class InventoryChangeEvent : UnityEngine.Events.UnityEvent<InventorySlot> { }
```

## Phase 4 — UI & Feedback

### HUD Controller

```csharp
// HUDController.cs
using UnityEngine;
using UnityEngine.UI;
using TMPro;

public class HUDController : MonoBehaviour
{
    [Header("Health UI")]
    [SerializeField] private Image healthFill;
    [SerializeField] private TextMeshProUGUI healthText;
    
    [Header("Stamina UI")]
    [SerializeField] private Image staminaFill;
    [SerializeField] private TextMeshProUGUI staminaText;
    
    [Header("Resource UI")]
    [SerializeField] private TextMeshProUGUI goldText;
    
    [Header("Ability Cooldowns")]
    [SerializeField] private Image[] abilityIcons;
    [SerializeField] private TextMeshProUGUI[] cooldownTexts;
    
    [Header("Events")]
    [SerializeField] private VoidEventChannel onDamageTaken;
    [SerializeField] private VoidEventChannel onHealthRestored;
    
    private HealthSystem _playerHealth;
    
    private void Awake()
    {
        var player = GameObject.FindGameObjectWithTag("Player");
        _playerHealth = player?.GetComponent<HealthSystem>();
    }
    
    private void OnEnable()
    {
        if (_playerHealth != null)
        {
            _playerHealth.OnHealthChanged.AddListener(UpdateHealth);
            _playerHealth.OnDeath.AddListener(OnPlayerDeath);
        }
        
        onDamageTaken.Subscribe(FlashDamage);
    }
    
    private void OnDisable()
    {
        if (_playerHealth != null)
        {
            _playerHealth.OnHealthChanged.RemoveListener(UpdateHealth);
            _playerHealth.OnDeath.RemoveListener(OnPlayerDeath);
        }
        
        onDamageTaken.Unsubscribe(FlashDamage);
    }
    
    private void Update()
    {
        UpdateAbilityCooldowns();
    }
    
    private void UpdateHealth(float current, float max)
    {
        float normalized = current / max;
        
        if (healthFill != null)
        {
            healthFill.fillAmount = normalized;
        }
        
        if (healthText != null)
        {
            healthText.text = $"{Mathf.CeilToInt(current)}/{Mathf.CeilToInt(max)}";
        }
    }
    
    private void UpdateAbilityCooldowns()
    {
        // Update cooldown UI based on ability states
    }
    
    private void FlashDamage()
    {
        // Visual feedback for damage taken
        StartCoroutine(DamageFlash());
    }
    
    private System.Collections.IEnumerator DamageFlash()
    {
        // Red flash effect
        yield return new WaitForSeconds(0.1f);
    }
    
    private void OnPlayerDeath()
    {
        // Show game over screen
    }
}
```

## Phase 5 — Testing & Polish

### Unity Test Framework

```csharp
// EditMode Test Example
namespace MyGame.Tests.EditMode
{
    [TestFixture]
    public class HealthSystemTests
    {
        private HealthSystem _health;
        
        [SetUp]
        public void Setup()
        {
            var go = new GameObject();
            _health = go.AddComponent<HealthSystem>();
            
            // Use reflection to set max health for testing
            var field = typeof(HealthSystem).GetField("maxHealth",
                BindingFlags.NonPublic | BindingFlags.Instance);
            field?.SetValue(_health, 100f);
        }
        
        [TearDown]
        public void TearDown()
        {
            UnityEngine.Object.DestroyImmediate(_health.gameObject);
        }
        
        [Test]
        public void TakeDamage_ReducesHealth()
        {
            _health.TakeDamage(25f);
            Assert.AreEqual(75f, _health.CurrentHealth);
        }
        
        [Test]
        public void TakeDamage_CannotGoBelowZero()
        {
            _health.TakeDamage(150f);
            Assert.AreEqual(0f, _health.CurrentHealth);
        }
        
        [Test]
        public void Heal_IncreasesHealth()
        {
            _health.TakeDamage(50f);
            _health.Heal(25f);
            Assert.AreEqual(75f, _health.CurrentHealth);
        }
        
        [Test]
        public void Heal_CannotExceedMax()
        {
            _health.Heal(50f);
            Assert.AreEqual(100f, _health.CurrentHealth);
        }
        
        [Test]
        public void Die_TriggersOnDeath()
        {
            bool deathCalled = false;
            _health.OnDeath.AddListener(() => deathCalled = true);
            
            _health.TakeDamage(100f);
            
            Assert.IsTrue(deathCalled);
            Assert.IsTrue(_health.IsDead);
        }
    }
}

// PlayMode Test Example
namespace MyGame.Tests.PlayMode
{
    public class PlayerControllerTests
    {
        [UnityTest]
        public IEnumerator Move_WithInput_MovesCharacter()
        {
            // Arrange
            var player = Object.Instantiate(
                Resources.Load<GameObject>("PlayerPrefab"));
            var controller = player.GetComponent<PlayerController>();
            
            // Act - simulate input
            InputManager.Instance.MoveInput = Vector2.right;
            
            yield return new WaitForSeconds(0.5f);
            
            // Assert
            Assert.IsTrue(controller.transform.position.x > 0);
            
            Object.Destroy(player);
        }
        
        [UnityTest]
        public IEnumerator Jump_WhenGrounded_Jumps()
        {
            var player = Object.Instantiate(
                Resources.Load<GameObject>("PlayerPrefab"));
            
            yield return null; // Wait one frame
            
            var initialY = player.transform.position.y;
            InputManager.Instance.JumpPressed = true;
            
            yield return new WaitForSeconds(0.2f);
            
            Assert.Greater(player.transform.position.y, initialY);
            
            Object.Destroy(player);
        }
    }
}
```

### Test Execution Commands

```bash
# Run all tests
Unity.exe -runTests -batchmode -projectPath . -testResults results.xml

# Run specific tests
Unity.exe -runTests -batchmode -projectPath . -testResults results.xml \
  -testFilter "MyGame.Tests.EditMode"

# Run by category
Unity.exe -runTests -batchmode -projectPath . -testResults results.xml \
  -testCategory "UnitTests"

# Run PlayMode tests
Unity.exe -runTests -batchmode -projectPath . -testResults results.xml \
  -testPlatform PlayMode
```

## Code Quality Standards

### Required Patterns

```csharp
// Dependency Injection via Constructor
public class MyService : IMyService
{
    private readonly IGameConfig _config;
    private readonly IEventService _events;
    
    public MyService(IGameConfig config, IEventService events)
    {
        _config = config ?? throw new ArgumentNullException(nameof(config));
        _events = events ?? throw new ArgumentNullException(nameof(events));
    }
}

// ScriptableObject for Configuration
[CreateAssetMenu(menuName = "Game/Stats/Player Stats")]
public class CharacterStats : ScriptableObject
{
    [Header("Health")]
    public float MaxHealth = 100f;
    public float HealthRegen = 0f;
    
    [Header("Movement")]
    public float MoveSpeed = 5f;
    public float SprintSpeed = 8f;
    public float JumpForce = 10f;
    
    [Header("Combat")]
    public float BaseDamage = 10f;
    public float AttackSpeed = 1f;
    public float CriticalChance = 0.05f;
}

// Observer Pattern via Events
public interface IGameEvent
{
    void Publish();
    void Subscribe(Action callback);
    void Unsubscribe(Action callback);
}
```

## Common Mistakes

| # | Mistake | Prevention |
|---|---------|------------|
| 1 | Using FindObjectOfType in tests | Inject dependencies via constructor |
| 2 | Hardcoded paths | Use Resources.Load or Addressables |
| 3 | Monobehaviour dependency | Use interfaces for all dependencies |
| 4 | No test coverage | Adopt TDD approach |
| 5 | Manual scene switching | Use test fixtures |
| 6 | Not null-checking GetComponent | Cache and validate components |
| 7 | Time.timeScale assumptions | Make time-aware code testable |
| 8 | Singleton abuse | Use proper DI instead |

## Handoff Protocol

| To | Provide |
|----|---------|
| QA Engineer | Build, test report |
| Level Designer | Prefabs, spawn points, ability to test |
| Technical Artist | Shader requirements, VFX triggers |
| Build Engineer | CI pipeline configuration |

## Execution Checklist

### Phase 1 — Setup & Architecture
- [ ] Unity project structure created
- [ ] Assembly Definitions (.asmdef) configured
- [ ] Test Framework package installed
- [ ] Namespace conventions established
- [ ] Code style guide applied
- [ ] Core managers implemented (Game, UI, Audio)
- [ ] Event system configured

### Phase 2 — Core Systems
- [ ] Input System (new Input System package)
- [ ] Character controller with physics
- [ ] Camera following player
- [ ] Scene management
- [ ] Save/Load system skeleton

### Phase 3 — Gameplay Implementation
- [ ] Player controller with movement
- [ ] Health system with damage/heal
- [ ] Combat system with hit detection
- [ ] Inventory system
- [ ] Basic enemy AI
- [ ] Progression system (XP/levels)

### Phase 4 — UI & Feedback
- [ ] HUD with health bar
- [ ] Pause menu
- [ ] VFX triggers for combat
- [ ] Audio triggers
- [ ] Loading screens

### Phase 5 — Testing & Polish
- [ ] Unit tests for all systems
- [ ] Integration tests for interactions
- [ ] Play mode tests for gameplay
- [ ] Performance profiling
- [ ] Build verification
- [ ] CI pipeline configured
