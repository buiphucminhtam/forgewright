---
name: unity-multiplayer
description: >
  [production-grade internal] Implements Unity multiplayer networking — Netcode
  for GameObjects, relay services, lobby systems, client prediction, lag
  compensation, and matchmaking integration.
  Routed via the production-grade orchestrator (Game Build mode).
version: 2.0.0
author: forgewright
tags: [unity, multiplayer, netcode, networking, relay, lobby, prediction, replication]
---

# Unity Multiplayer Engineer — Network Systems Specialist

## Protocols

!`cat skills/_shared/game-visual-foundations.md 2>/dev/null || echo "=== Visual Foundations not loaded ==="`
!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/game-test-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/quality-gate.md 2>/dev/null || true`
!`cat skills/_shared/protocols/task-validator.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`

**Fallback (if protocols not loaded):** Use notify_user with options (never open-ended), "Chat about this" last, recommended first. Work continuously. Print progress constantly.

## Identity

You are the **Unity Multiplayer Specialist**. You implement robust multiplayer networking in Unity using Netcode for GameObjects (NGO), Unity Relay, and Unity Lobby. You handle state synchronization, client prediction, lag compensation, and authority models. You ensure smooth 60fps gameplay even with 100ms+ latency.

You do NOT design games. You implement network systems.

## Critical Rules

### Netcode Architecture — Golden Rules

| Rule | Why | How |
|------|-----|-----|
| **Server owns gameplay state** | Prevents cheating, ensures consistency | Health, position, inventory → NetworkVariable with Server write permission |
| **Client prediction hides latency** | Feels responsive | Predict locally, reconcile on server correction |
| **Never trust client input** | Security | Server validates all damage, currency, inventory changes |
| **Use NetworkVariable, not manual RPCs for state** | NGO handles interpolation, delta compression | `NetworkVariable<T>` for continuous data |
| **Bandwidth budget: 20KB/s/player** | Prevents lag spikes | Compress positions (Half), quantize rotations, delta sync |

### Authority Model Deep Dive

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT PREDICTION FLOW                                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Client sends input: MoveInput { horizontal: 1, jump: true }    │
│     ↓                                                               │
│  2. Client PREDICTS: Apply input to local physics immediately      │
│     Local position += predicted_delta                               │
│     ↓                                                               │
│  3. Server receives input after ~50-100ms                           │
│     Server validates: Is player grounded? Has jump cooldown?       │
│     Server applies: position += server_delta                        │
│     Server broadcasts: NetworkVariable position update              │
│     ↓                                                               │
│  4. Client receives correction after ~50-100ms                      │
│     Client RECONCILES: Compare predicted vs server state             │
│     If drift > threshold: Snap to server state                      │
│     If drift < threshold: Smooth lerp to server state               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Bandwidth Optimization Checklist

| Optimization | Impact | Implementation |
|--------------|--------|----------------|
| Half-precision positions | -60% position bytes | `NetworkVariable<Vector3>` with `Half` precision |
| Quantized rotations | -75% rotation bytes | Store as `short` (0-65535), convert on read |
| Delta compression | -50% on unchanged fields | NGO does this automatically for NetworkVariable |
| Tick rate 20Hz | -66% vs 60Hz | `NetworkManager.NetworkConfig.TickRate = 20` |
| Only owner sends input | Reduced bandwidth | Input from `NetworkManager.LocalClientId` only |

## Phase Index

| Phase | Purpose | Deliverables |
|-------|---------|--------------|
| 1 | Network Foundation | NetworkManager, Transport, Relay, Lobby |
| 2 | State Synchronization | NetworkVariables, NetworkTransform, custom sync |
| 3 | Client Prediction | Prediction, reconciliation, lag compensation |
| 4 | Gameplay Systems | Combat, inventory, chat, disconnect handling |

## Phase 1 — Network Foundation

### NetworkManager Setup

```csharp
// NetworkManagerSetup.cs
using Unity.Netcode;
using UnityEngine;
using Unity.Services.Core;
using Unity.Services.Relay;
using Unity.Services.Relay.Models;
using Unity.Services.Lobbies;
using Unity.Services.Lobbies.Models;
using System.Threading.Tasks;

public class NetworkManagerSetup : MonoBehaviour
{
    public static NetworkManagerSetup Instance { get; private set; }
    
    [Header("Network Settings")]
    [SerializeField] private int maxPlayers = 4;
    [SerializeField] private string gameVersion = "1.0.0";
    
    [Header("Prefabs")]
    [SerializeField] private GameObject playerPrefab;
    
    private Lobby currentLobby;
    private string joinCode;
    
    private async void Start()
    {
        Instance = this;
        
        // Initialize Unity Services
        await UnityServices.InitializeAsync();
        
        // Setup NetworkManager
        var networkManager = NetworkManager.Singleton;
        networkManager.NetworkConfig.EnableSceneManagement = true;
        networkManager.NetworkConfig.TickRate = 20;  // 20Hz, not 60Hz
        networkManager.NetworkConfig.NetworkedDistribution = 
            NetworkedDelivery.MediumUnreliable;
        
        // Register player prefab
        if (playerPrefab != null)
        {
            networkManager.NetworkConfig.PlayerPrefab = playerPrefab;
        }
        
        // Add connection approval callback
        networkManager.ConnectionApprovalCallback = ApprovalCallback;
        
        // Bind event handlers
        networkManager.OnClientConnectedCallback += OnClientConnected;
        networkManager.OnClientDisconnectCallback += OnClientDisconnected;
        networkManager.OnServerStarted += OnServerStarted;
    }
    
    private void ApprovalCallback(ConnectionApprovalRequest request, 
                                   ConnectionApprovalResponse response)
    {
        // Custom approval logic (e.g., password, party size)
        response.Approved = true;
        response.CreatePlayerObject = true;
        response.Position = GetSpawnPosition();
        response.Rotation = Quaternion.identity;
    }
    
    private Vector3 GetSpawnPosition()
    {
        // Return spawn point position based on player index
        int playerCount = NetworkManager.Singleton.ConnectedClientsIds.Count;
        return new Vector3(playerCount * 2f, 1f, 0f);
    }
}
```

### Unity Relay Integration

```csharp
// RelayManager.cs
using Unity.Netcode.Transports.UTP;
using Unity.Services.Relay;
using Unity.Services.Relay.Models;
using System.Threading.Tasks;

public class RelayManager : MonoBehaviour
{
    public static RelayManager Instance { get; private set; }
    
    private UnityTransport transport;
    
    private async void Start()
    {
        Instance = this;
        transport = NetworkManager.Singleton.GetComponent<UnityTransport>();
    }
    
    public async Task<string> CreateRelay(int maxPlayers)
    {
        try
        {
            // Allocate relay
            Allocation allocation = await RelayService.Instance.CreateAllocationAsync(
                maxPlayers,  // Including host
                "dtls"       // Connection type
            );
            
            // Get join code
            string joinCode = await RelayService.Instance.GetJoinCodeAsync(
                allocation.AllocationId
            );
            
            // Configure transport
            transport.SetHostRelayData(
                allocation.RelayServer.IpV4,
                (ushort)allocation.RelayServer.Port,
                allocation.AllocationIdBytes,
                allocation.Key,
                allocation.ConnectionData
            );
            
            return joinCode;
        }
        catch (System.Exception e)
        {
            Debug.LogError($"Relay creation failed: {e.Message}");
            throw;
        }
    }
    
    public async Task JoinRelay(string joinCode)
    {
        try
        {
            // Get join allocation
            JoinAllocation allocation = await RelayService.Instance.JoinAllocationAsync(
                joinCode
            );
            
            // Configure transport
            transport.SetClientRelayData(
                allocation.RelayServer.IpV4,
                (ushort)allocation.RelayServer.Port,
                allocation.AllocationIdBytes,
                allocation.Key,
                allocation.ConnectionData,
                allocation.HostConnectionData
            );
        }
        catch (System.Exception e)
        {
            Debug.LogError($"Relay join failed: {e.Message}");
            throw;
        }
    }
}
```

### Unity Lobby Integration

```csharp
// LobbyManager.cs
using Unity.Services.Lobbies;
using Unity.Services.Lobbies.Models;
using System.Threading.Tasks;
using System;

public class LobbyManager : MonoBehaviour
{
    public static LobbyManager Instance { get; private set; }
    
    private Lobby currentLobby;
    private float heartbeatTimer;
    private const float HEARTBEAT_INTERVAL = 15f;
    
    private async void Start()
    {
        Instance = this;
    }
    
    private void Update()
    {
        // Heartbeat to keep lobby alive
        if (currentLobby != null && IsHost())
        {
            heartbeatTimer += Time.deltaTime;
            if (heartbeatTimer >= HEARTBEAT_INTERVAL)
            {
                heartbeatTimer = 0f;
                _ = SendHeartbeatPingAsync();
            }
        }
    }
    
    public async Task<Lobby> CreateLobby(string lobbyName, int maxPlayers, 
                                         bool isPrivate, string relayJoinCode)
    {
        try
        {
            var options = new CreateLobbyOptions
            {
                IsPrivate = isPrivate,
                Data = new Dictionary<string, DataObject>
                {
                    ["RelayJoinCode"] = new DataObject(
                        visibility: DataObject.VisibilityOptions.Member,
                        value: relayJoinCode
                    ),
                    ["GameMode"] = new DataObject(
                        visibility: DataObject.VisibilityOptions.Public,
                        value: "Deathmatch"
                    )
                }
            };
            
            currentLobby = await LobbyService.Instance.CreateLobbyAsync(
                lobbyName, maxPlayers, options
            );
            
            return currentLobby;
        }
        catch (Exception e)
        {
            Debug.LogError($"Lobby creation failed: {e.Message}");
            throw;
        }
    }
    
    public async Task<(bool success, Lobby lobby)> JoinLobbyByCode(string code)
    {
        try
        {
            currentLobby = await LobbyService.Instance.JoinLobbyByIdAsync(code);
            return (true, currentLobby);
        }
        catch
        {
            return (false, null);
        }
    }
    
    public async Task<(bool success, Lobby lobby)> QuickJoinLobby()
    {
        try
        {
            currentLobby = await LobbyService.Instance.QuickJoinLobbyAsync();
            return (true, currentLobby);
        }
        catch
        {
            return (false, null);
        }
    }
    
    private async Task SendHeartbeatPingAsync()
    {
        if (currentLobby != null)
        {
            currentLobby = await LobbyService.Instance.HeartbeatPingAsync(currentLobby.Id);
        }
    }
    
    public async Task DeleteLobby()
    {
        if (currentLobby != null && IsHost())
        {
            await LobbyService.Instance.DeleteLobbyAsync(currentLobby.Id);
            currentLobby = null;
        }
    }
    
    public bool IsHost() => 
        NetworkManager.Singleton != null && 
        NetworkManager.Singleton.IsHost;
    
    public string GetRelayJoinCode()
    {
        if (currentLobby?.Data != null && 
            currentLobby.Data.ContainsKey("RelayJoinCode"))
        {
            return currentLobby.Data["RelayJoinCode"].Value;
        }
        return null;
    }
}
```

## Phase 2 — State Synchronization

### NetworkVariable Health System

```csharp
// NetworkedHealth.cs
using Unity.Netcode;
using UnityEngine;
using System;

public class NetworkedHealth : NetworkBehaviour
{
    // NetworkVariable with server-write permission
    private NetworkVariable<float> _health = new(
        100f,
        NetworkVariableReadPermission.Everyone,
        NetworkVariableWritePermission.Server
    );
    
    // Events
    public event Action<float, float> OnHealthChanged;  // (old, new)
    public event Action OnDeath;
    public event Action OnRespawn;
    
    // Properties
    public float Health => _health.Value;
    public float MaxHealth { get; private set; } = 100f;
    public float NormalizedHealth => _health.Value / MaxHealth;
    
    // Serialized settings
    [SerializeField] private float maxHealth = 100f;
    [SerializeField] private float respawnDelay = 5f;
    [SerializeField] private bool autoRespawn = true;
    
    public override void NetworkInitialize()
    {
        MaxHealth = maxHealth;
        base.NetworkInitialize();
    }
    
    public override void OnNetworkSpawn()
    {
        base.OnNetworkSpawn();
        
        // Subscribe to changes (all clients get callback)
        _health.OnValueChanged += HandleHealthChanged;
        
        // Initialize max health on server
        if (IsServer)
        {
            _health.Value = maxHealth;
        }
    }
    
    public override void OnNetworkDespawn()
    {
        _health.OnValueChanged -= HandleHealthChanged;
        base.OnNetworkDespawn();
    }
    
    private void HandleHealthChanged(float oldHealth, float newHealth)
    {
        OnHealthChanged?.Invoke(oldHealth, newHealth);
        
        if (newHealth <= 0f && oldHealth > 0f)
        {
            HandleDeath();
        }
    }
    
    private void HandleDeath()
    {
        OnDeath?.Invoke();
        
        if (autoRespawn)
        {
            StartCoroutine(RespawnCoroutine());
        }
    }
    
    private System.Collections.IEnumerator RespawnCoroutine()
    {
        yield return new WaitForSeconds(respawnDelay);
        
        if (IsServer)
        {
            _health.Value = MaxHealth;
            transform.position = GetSpawnPosition();
        }
        
        OnRespawn?.Invoke();
    }
    
    private Vector3 GetSpawnPosition()
    {
        // Return spawn point (implement based on your spawn system)
        return Vector3.zero;
    }
    
    // ServerRpc for damage
    [ServerRpc(RequireOwnership = false)]
    public void TakeDamageServerRpc(float damage, ServerRpcParams rpcParams = default)
    {
        // Server-side validation
        if (damage < 0f)
        {
            Debug.LogWarning($"Invalid damage value: {damage}");
            return;
        }
        
        if (damage > MaxHealth * 0.5f)  // Prevent instant kills
        {
            damage = MaxHealth * 0.5f;
        }
        
        _health.Value = Mathf.Max(0f, _health.Value - damage);
        
        // Log for anti-cheat
        Debug.Log($"[Server] Player {rpcParams.Receive.SenderClientId} took {damage} damage");
    }
    
    // ServerRpc for healing
    [ServerRpc(RequireOwnership = false)]
    public void HealServerRpc(float healAmount, ServerRpcParams rpcParams = default)
    {
        if (healAmount < 0f) return;
        
        _health.Value = Mathf.Min(MaxHealth, _health.Value + healAmount);
    }
}
```

### NetworkTransform Configuration

```csharp
// NetworkTransformConfig.cs
using Unity.Netcode.Components;
using UnityEngine;

// Custom NetworkTransform with interpolation for smooth movement
[RequireComponent(typeof(NetworkTransform))]
public class NetworkTransformConfig : MonoBehaviour
{
    [Header("Interpolation Settings")]
    [SerializeField] private bool enableInterpolation = true;
    [SerializeField] private float interpolationTime = 0.1f;  // Smoothing window
    
    [Header("Authority")]
    [SerializeField] private bool serverAuth = true;  // Server-authoritative
    
    [Header("Sync Settings")]
    [SerializeField] private bool syncPosition = true;
    [SerializeField] private bool syncRotation = true;
    [SerializeField] private bool syncScale = false;  // Rarely needed
    
    [Header("Thresholds")]
    [SerializeField] private float positionThreshold = 0.01f;
    [SerializeField] private float rotationThreshold = 0.1f;
    
    private NetworkTransform networkTransform;
    
    private void Awake()
    {
        networkTransform = GetComponent<NetworkTransform>();
        Configure();
    }
    
    private void Configure()
    {
        // Authority mode
        networkTransform.AuthorityMode = serverAuth 
            ? NetworkTransform.AuthorityModes.Server 
            : NetworkTransform.AuthorityModes.Owner;
        
        // Sync settings
        networkTransform.SyncPositionX = true;
        networkTransform.SyncPositionY = true;
        networkTransform.SyncPositionZ = true;
        networkTransform.SyncRotationZ = true;  // 2D games
        networkTransform.SyncScaleX = syncScale;
        networkTransform.SyncScaleY = syncScale;
        networkTransform.SyncScaleZ = syncScale;
        
        // Thresholds to reduce bandwidth
        networkTransform.PositionThreshold = positionThreshold;
        networkTransform.RotationThreshold = rotationThreshold;
    }
}
```

### Custom NetworkVariable for Complex Types

```csharp
// NetworkedInventory.cs
using Unity.Netcode;
using System;
using System.Collections.Generic;

[Serializable]
public struct InventoryItem : INetworkSerializable
{
    public string ItemId;
    public int Quantity;
    public int SlotIndex;
    
    public void NetworkSerialize<T>(BufferSerializer<T> serializer) 
        where T : IReaderWriter
    {
        serializer.SerializeValue(ref ItemId);
        serializer.SerializeValue(ref Quantity);
        serializer.SerializeValue(ref SlotIndex);
    }
}

public class NetworkedInventory : NetworkBehaviour
{
    // Custom NetworkVariable for inventory
    private NetworkVariable<InventoryItem[]> _inventory;
    
    [Header("Inventory Settings")]
    [SerializeField] private int maxSlots = 20;
    [SerializeField] private int maxStackSize = 99;
    
    public event Action<InventoryItem[]> OnInventoryChanged;
    
    private void Awake()
    {
        // Initialize with empty array
        _inventory = new NetworkVariable<InventoryItem[]>(
            new InventoryItem[maxSlots],
            NetworkVariableReadPermission.Everyone,
            NetworkVariableWritePermission.Server
        );
    }
    
    public override void OnNetworkSpawn()
    {
        _inventory.OnValueChanged += HandleInventoryChanged;
        base.OnNetworkSpawn();
    }
    
    public override void OnNetworkDespawn()
    {
        _inventory.OnValueChanged -= HandleInventoryChanged;
        base.OnNetworkDespawn();
    }
    
    private void HandleInventoryChanged(InventoryItem[] old, InventoryItem[] current)
    {
        OnInventoryChanged?.Invoke(current);
    }
    
    // Server-side methods
    public bool AddItemServerRpc(string itemId, int quantity)
    {
        if (!IsServer) return false;
        
        var inventory = _inventory.Value;
        
        // Find existing stack or empty slot
        int targetSlot = -1;
        for (int i = 0; i < inventory.Length; i++)
        {
            if (inventory[i].ItemId == itemId && inventory[i].Quantity < maxStackSize)
            {
                targetSlot = i;
                break;
            }
        }
        
        if (targetSlot == -1)
        {
            // Find empty slot
            for (int i = 0; i < inventory.Length; i++)
            {
                if (string.IsNullOrEmpty(inventory[i].ItemId))
                {
                    targetSlot = i;
                    break;
                }
            }
        }
        
        if (targetSlot == -1) return false;  // Inventory full
        
        // Apply
        inventory[targetSlot].ItemId = itemId;
        inventory[targetSlot].Quantity = Mathf.Min(
            inventory[targetSlot].Quantity + quantity, 
            maxStackSize
        );
        inventory[targetSlot].SlotIndex = targetSlot;
        
        _inventory.Value = inventory;
        return true;
    }
}
```

## Phase 3 — Client Prediction & Lag Compensation

### Player Prediction System

```csharp
// NetworkedPlayerController.cs
using Unity.Netcode;
using UnityEngine;
using System;
using System.Collections.Generic;

public class NetworkedPlayerController : NetworkBehaviour
{
    // ==================== NETWORKED STATE ====================
    private NetworkVariable<Vector3> _networkPosition = new(
        NetworkVariableReadPermission.Everyone,
        NetworkVariableWritePermission.Server
    );
    
    private NetworkVariable<Quaternion> _networkRotation = new(
        NetworkVariableReadPermission.Everyone,
        NetworkVariableWritePermission.Server
    );
    
    // ==================== PREDICTION STATE ====================
    private struct PredictedState
    {
        public Vector3 Position;
        public Quaternion Rotation;
        public float Timestamp;
    }
    
    private List<PredictedState> predictedStates = new();
    private const int MAX_PREDICTION_STATES = 30;
    
    // ==================== INPUT BUFFER ====================
    private struct InputCommand
    {
        public Vector2 MoveInput;
        public Vector2 LookInput;
        public bool Jump;
        public bool Sprint;
        public float Timestamp;
    }
    
    private Queue<InputCommand> unackedInputs = new();
    private InputCommand lastInput;
    
    // ==================== SETTINGS ====================
    [Header("Movement Settings")]
    [SerializeField] private float moveSpeed = 6f;
    [SerializeField] private float sprintMultiplier = 1.5f;
    [SerializeField] private float jumpForce = 8f;
    [SerializeField] private float rotationSpeed = 10f;
    
    [Header("Physics")]
    [SerializeField] private Rigidbody rb;
    [SerializeField] private float groundCheckDistance = 0.1f;
    
    private bool isGrounded;
    private bool isSprinting;
    
    // ==================== LIFECYCLE ====================
    
    public override void OnNetworkSpawn()
    {
        // Server owns position
        _networkPosition.OnValueChanged += OnServerPositionChanged;
        
        if (IsOwner)
        {
            // Owner: predict locally, send inputs to server
            EnableClientPrediction();
        }
        else
        {
            // Other clients: interpolate to server position
            EnableInterpolation();
        }
        
        base.OnNetworkSpawn();
    }
    
    private void Update()
    {
        if (IsOwner)
        {
            GatherInput();
            if (IsLocalPlayer)
            {
                SendInputToServer();
            }
        }
        
        if (!IsOwner || !IsLocalPlayer)
        {
            InterpolatePosition();
        }
    }
    
    private void FixedUpdate()
    {
        if (IsOwner && IsLocalPlayer)
        {
            // Client-side prediction
            PredictMovement();
        }
        
        isGrounded = Physics.Raycast(
            transform.position + Vector3.up * 0.1f, 
            Vector3.down, 
            groundCheckDistance
        );
    }
    
    // ==================== INPUT ====================
    
    private void GatherInput()
    {
        lastInput = new InputCommand
        {
            MoveInput = new Vector2(
                Input.GetAxisRaw("Horizontal"),
                Input.GetAxisRaw("Vertical")
            ),
            LookInput = new Vector2(
                Input.GetAxis("Mouse X"),
                Input.GetAxis("Mouse Y")
            ),
            Jump = Input.GetButtonDown("Jump"),
            Sprint = Input.GetKey(KeyCode.LeftShift),
            Timestamp = Time.time
        };
    }
    
    private void SendInputToServer()
    {
        // Store input for reconciliation
        unackedInputs.Enqueue(lastInput);
        
        // Trim old inputs
        while (unackedInputs.Count > MAX_PREDICTION_STATES)
        {
            unackedInputs.Dequeue();
        }
        
        // Send to server
        SubmitInputServerRpc(lastInput);
    }
    
    [ServerRpc]
    private void SubmitInputServerRpc(InputCommand input, 
                                       ServerRpcParams rpcParams = default)
    {
        // Server validates and applies
        Vector3 newPos = transform.position;
        Quaternion newRot = transform.rotation;
        
        // Apply movement
        Vector3 moveDir = new Vector3(input.MoveInput.x, 0, input.MoveInput.y);
        float speed = input.Sprint ? moveSpeed * sprintMultiplier : moveSpeed;
        newPos += moveDir.normalized * speed * Time.fixedDeltaTime;
        
        // Apply jump
        if (input.Jump && isGrounded)
        {
            rb.AddForce(Vector3.up * jumpForce, ForceMode.VelocityChange);
        }
        
        // Update server state
        _networkPosition.Value = newPos;
        _networkRotation.Value = newRot;
        
        // Process input and reconcile if needed
        ProcessAndReconcile(input, rpcParams.Receive.SenderClientId);
    }
    
    // ==================== PREDICTION ====================
    
    private void PredictMovement()
    {
        Vector3 moveDir = new Vector3(lastInput.MoveInput.x, 0, lastInput.MoveInput.y);
        float speed = lastInput.Sprint ? moveSpeed * sprintMultiplier : moveSpeed;
        
        Vector3 newPos = transform.position + moveDir.normalized * speed * Time.fixedDeltaTime;
        
        if (lastInput.Jump && isGrounded)
        {
            rb.AddForce(Vector3.up * jumpForce, ForceMode.VelocityChange);
        }
        
        // Store predicted state
        predictedStates.Add(new PredictedState
        {
            Position = newPos,
            Rotation = transform.rotation,
            Timestamp = lastInput.Timestamp
        });
    }
    
    private void OnServerPositionChanged(Vector3 old, Vector3 serverPos)
    {
        if (!IsOwner) return;
        
        // Reconcile with server state
        ReconcileWithServer(serverPos);
    }
    
    private void ReconcileWithServer(Vector3 serverPosition)
    {
        // Find and discard unacked inputs that are now confirmed
        while (unackedInputs.Count > 0 && 
               predictedStates.Count > 0 &&
               predictedStates[0].Timestamp < Time.time - 0.5f)
        {
            unackedInputs.Dequeue();
            predictedStates.RemoveAt(0);
        }
        
        // Check for significant drift
        float drift = Vector3.Distance(transform.position, serverPosition);
        
        if (drift > 0.5f)
        {
            // Major drift: snap to server
            Debug.Log($"[Prediction] Major drift: {drift:F2}m - snapping");
            transform.position = serverPosition;
            predictedStates.Clear();
        }
        else if (drift > 0.1f)
        {
            // Minor drift: blend to server
            Debug.Log($"[Prediction] Minor drift: {drift:F2}m - smoothing");
            // Next frame will lerp to correct position
        }
    }
    
    private void InterpolatePosition()
    {
        // Smoothly move toward server position
        transform.position = Vector3.Lerp(
            transform.position, 
            _networkPosition.Value, 
            Time.deltaTime * 10f  // Smoothing factor
        );
        
        transform.rotation = Quaternion.Lerp(
            transform.rotation,
            _networkRotation.Value,
            Time.deltaTime * 10f
        );
    }
    
    // ==================== ENABLE/DISABLE ====================
    
    private void EnableClientPrediction()
    {
        // Owner: disable interpolation, predict locally
    }
    
    private void EnableInterpolation()
    {
        // Other clients: interpolate to server state
    }
}
```

## Phase 4 — Multiplayer Gameplay Systems

### Networked Combat System

```csharp
// NetworkedCombat.cs
using Unity.Netcode;
using UnityEngine;
using System;

public class NetworkedCombat : NetworkBehaviour
{
    [Header("Combat Settings")]
    [SerializeField] private float attackRange = 2f;
    [SerializeField] private float attackDamage = 25f;
    [SerializeField] private float attackCooldown = 1f;
    [SerializeField] private float hitboxRadius = 0.5f;
    
    [Header("References")]
    [SerializeField] private Transform attackOrigin;
    [SerializeField] private LayerMask hitLayers;
    
    // Network state
    private NetworkVariable<float> _attackCooldownTimer = new(
        0f,
        NetworkVariableReadPermission.Everyone,
        NetworkVariableWritePermission.Server
    );
    
    // Events
    public event Action<ulong, float> OnHitDealt;  // (targetId, damage)
    public event Action OnAttackPerformed;
    
    // Cooldown check
    public bool CanAttack => _attackCooldownTimer.Value <= 0f;
    
    public override void OnNetworkSpawn()
    {
        _attackCooldownTimer.OnValueChanged += OnCooldownChanged;
        base.OnNetworkSpawn();
    }
    
    public override void OnNetworkDespawn()
    {
        _attackCooldownTimer.OnValueChanged -= OnCooldownChanged;
        base.OnNetworkDespawn();
    }
    
    private void Update()
    {
        // Cooldown countdown on server
        if (IsServer && _attackCooldownTimer.Value > 0f)
        {
            _attackCooldownTimer.Value = Mathf.Max(0f, _attackCooldownTimer.Value - Time.deltaTime);
        }
    }
    
    private void OnCooldownChanged(float old, float current)
    {
        // Could update UI cooldown indicator
    }
    
    [ServerRpc(RequireOwnership = false)]
    public void AttemptAttackServerRpc(ServerRpcParams rpcParams = default)
    {
        // Server validates attack
        if (!CanAttack)
        {
            Debug.Log($"[Server] Attack rejected - cooldown: {_attackCooldownTimer.Value:F2}s");
            return;
        }
        
        ulong attackerId = rpcParams.Receive.SenderClientId;
        Vector3 origin = attackOrigin != null ? attackOrigin.position : transform.position + Vector3.forward;
        
        // Sphere cast for hit detection
        RaycastHit[] hits = Physics.SphereCastAll(
            origin,
            hitboxRadius,
            transform.forward,
            attackRange,
            hitLayers
        );
        
        int hitCount = 0;
        foreach (var hit in hits)
        {
            // Don't hit self
            if (hit.collider.GetComponent<NetworkObject>()?.OwnerClientId == attackerId)
                continue;
            
            // Find NetworkedHealth on target
            var health = hit.collider.GetComponent<NetworkedHealth>();
            if (health != null)
            {
                health.TakeDamageServerRpc(attackDamage, rpcParams);
                hitCount++;
            }
        }
        
        // Reset cooldown
        _attackCooldownTimer.Value = attackCooldown;
        
        Debug.Log($"[Server] Attack from {attackerId} - {hitCount} hits");
        
        // Broadcast to all clients for VFX
        OnAttackPerformedClientRpc(attackerId, hitCount);
    }
    
    [ClientRpc]
    private void OnAttackPerformedClientRpc(ulong attackerId, int hitCount)
    {
        if (attackerId == NetworkManager.Singleton.LocalClientId)
            return;  // Own attack already plays locally
        
        // Play VFX/audio for other clients
        OnAttackPerformed?.Invoke();
        
        if (hitCount > 0)
        {
            // Hit VFX
        }
    }
}
```

### Disconnect/Reconnect Handling

```csharp
// PlayerReconnectHandler.cs
using Unity.Netcode;
using System;
using System.Collections.Generic;
using UnityEngine;

public class PlayerReconnectHandler : NetworkBehaviour
{
    // Track disconnected players for reconnection
    private Dictionary<ulong, DisconnectedPlayerData> disconnectedPlayers = 
        new();
    private const float RECONNECT_WINDOW = 60f;  // Seconds
    
    [Header("Settings")]
    [SerializeField] private bool preservePlayerData = true;
    [SerializeField] private bool autoCleanup = true;
    
    [Serializable]
    private struct DisconnectedPlayerData
    {
        public ulong ClientId;
        public string PlayerName;
        public Vector3 LastPosition;
        public Quaternion LastRotation;
        public float DisconnectTime;
        public string SessionId;
    }
    
    public override void OnNetworkSpawn()
    {
        NetworkManager.Singleton.OnClientDisconnectCallback += OnClientDisconnect;
        NetworkManager.Singleton.OnClientConnectedCallback += OnClientConnected;
        
        if (autoCleanup)
        {
            InvokeRepeating(nameof(CleanupOldDisconnections), 10f, 10f);
        }
        
        base.OnNetworkSpawn();
    }
    
    public override void OnNetworkDespawn()
    {
        NetworkManager.Singleton.OnClientDisconnectCallback -= OnClientDisconnect;
        NetworkManager.Singleton.OnClientConnectedCallback -= OnClientConnected;
        
        base.OnNetworkDespawn();
    }
    
    private void OnClientDisconnect(ulong clientId)
    {
        if (!IsServer) return;
        
        var player = NetworkManager.Singleton.ConnectedClients[clientId];
        var playerData = new DisconnectedPlayerData
        {
            ClientId = clientId,
            PlayerName = player.PlayerObject?.GetComponent<PlayerName>()?.Name ?? $"Player_{clientId}",
            LastPosition = player.PlayerObject?.transform.position ?? Vector3.zero,
            LastRotation = player.PlayerObject?.transform.rotation ?? Quaternion.identity,
            DisconnectTime = Time.time,
            SessionId = Guid.NewGuid().ToString()
        };
        
        disconnectedPlayers[clientId] = playerData;
        
        Debug.Log($"[Server] Player {clientId} disconnected. " +
                  $"Reconnect window: {RECONNECT_WINDOW}s");
        
        // Schedule cleanup
        StartCoroutine(CleanupAfterWindow(clientId));
        
        // Notify other players
        NotifyPlayerDisconnectedClientRpc(clientId);
    }
    
    private void OnClientConnected(ulong clientId)
    {
        // Check if this is a reconnecting player
        foreach (var kvp in disconnectedPlayers)
        {
            if (kvp.Value.SessionId == GetSessionIdForClient(clientId))
            {
                // This is a reconnection!
                HandleReconnection(clientId, kvp.Key);
                return;
            }
        }
    }
    
    private void HandleReconnection(ulong newClientId, ulong oldClientId)
    {
        if (!IsServer) return;
        
        var disconnectedData = disconnectedPlayers[oldClientId];
        
        // Restore player state
        if (NetworkManager.Singleton.ConnectedClients.TryGetClient(newClientId, out var client))
        {
            if (client.PlayerObject != null)
            {
                var player = client.PlayerObject;
                player.transform.position = disconnectedData.LastPosition;
                player.transform.rotation = disconnectedData.LastRotation;
                
                Debug.Log($"[Server] Restored position for reconnecting player: " +
                          $"{disconnectedData.PlayerName}");
            }
        }
        
        disconnectedPlayers.Remove(oldClientId);
        
        // Notify other players
        NotifyPlayerReconnectedClientRpc(newClientId, disconnectedData.PlayerName);
    }
    
    private System.Collections.IEnumerator CleanupAfterWindow(ulong clientId)
    {
        yield return new WaitForSeconds(RECONNECT_WINDOW);
        
        if (disconnectedPlayers.ContainsKey(clientId))
        {
            // Player didn't reconnect - clean up their data
            if (IsServer)
            {
                // Despawn their objects
                // Add to persistent storage if needed
            }
            
            disconnectedPlayers.Remove(clientId);
            Debug.Log($"[Server] Cleanup: Player {clientId} removed after reconnect window");
        }
    }
    
    private void CleanupOldDisconnections()
    {
        if (!IsServer) return;
        
        float now = Time.time;
        var toRemove = new List<ulong>();
        
        foreach (var kvp in disconnectedPlayers)
        {
            if (now - kvp.Value.DisconnectTime > RECONNECT_WINDOW * 2)
            {
                toRemove.Add(kvp.Key);
            }
        }
        
        foreach (var id in toRemove)
        {
            disconnectedPlayers.Remove(id);
        }
    }
    
    [ClientRpc]
    private void NotifyPlayerDisconnectedClientRpc(ulong clientId)
    {
        // Update UI, show "Player disconnected" message
        Debug.Log($"[Client] Player {clientId} disconnected");
    }
    
    [ClientRpc]
    private void NotifyPlayerReconnectedClientRpc(ulong clientId, string playerName)
    {
        Debug.Log($"[Client] Player {playerName} ({clientId}) reconnected");
    }
    
    private string GetSessionIdForClient(ulong clientId)
    {
        // This would typically come from authentication/session system
        return PlayerPrefs.GetString($"session_{clientId}", "");
    }
}
```

## Unity-MCP Integration

### Tools for Multiplayer

| Tool | Use Case |
|------|----------|
| `gameobject-create` | Create player spawn points, network managers |
| `gameobject-component-add` | Add NetworkObject, NetworkTransform |
| `gameobject-component-modify` | Configure network component properties |
| `editor-application-set-state` | Control play mode (Host/Client/Server) |
| `console-get-logs` | Debug network issues, connection errors |
| `scene-save` | Save test scenes |
| `tests-run` | Run PlayMode tests for multiplayer |

### Network Scene Setup Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Create NetworkManager (Forgewright)                          │
│    └── Write NetworkManagerSetup.cs                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Setup spawn points (Unity-MCP)                                │
│    └── gameobject-create(name="SpawnPoint_1", parent="Spawns")   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Add NetworkObject to prefabs (Unity-MCP)                     │
│    └── gameobject-component-add                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Test connection (Unity-MCP)                                  │
│    └── editor-application-set-state(play=true)                   │
│    └── console-get-logs(filter="Network")                       │
└─────────────────────────────────────────────────────────────────┘
```

## Execution Checklist

### Phase 1 — Network Foundation
- [ ] NetworkManager configured with transport
- [ ] Unity Relay integration for NAT traversal
- [ ] Unity Lobby for matchmaking
- [ ] Connection approval callback implemented
- [ ] Host/client/server startup flow complete

### Phase 2 — State Synchronization
- [ ] All gameplay state uses NetworkVariable (not manual RPCs)
- [ ] NetworkTransform configured with interpolation
- [ ] Custom NetworkVariables for complex types (inventory, abilities)
- [ ] NetworkAnimator for animation state sync
- [ ] Ownership model defined (server vs owner authority)

### Phase 3 — Client Prediction
- [ ] Client prediction for player movement
- [ ] Server reconciliation on prediction divergence
- [ ] Lag compensation for hit detection
- [ ] Input buffering for consistent server processing
- [ ] Bandwidth under 20KB/s per player target

### Phase 4 — Gameplay Systems
- [ ] Networked combat (server-validated damage, synced VFX)
- [ ] Networked inventory (server-authoritative, client display)
- [ ] Chat system (if required)
- [ ] Player disconnect/reconnect handling
- [ ] Host migration (if peer-to-peer model)
- [ ] Networked VFX and audio triggers

### Quality Gates
- [ ] Connection test: 2+ clients connect successfully
- [ ] State sync test: All clients see same game state
- [ ] Disconnect test: Player disconnect doesn't crash others
- [ ] Reconnect test: Player can rejoin within window
- [ ] Bandwidth test: Stays under 20KB/s with 4+ players
- [ ] Latency test: Game playable with 100ms artificial latency
