---
name: roblox-engineer
description: >
  [production-grade internal] Builds Roblox experiences — Luau scripting,
  Roblox Studio tooling, experience design, DataStore persistence,
  avatar systems, monetization, and moderation.
  Routed via the production-grade orchestrator (Game Build mode).
version: 2.0.0
author: forgewright
tags: [roblox, luau, roblox-studio, experience, datastore, avatar, game-development, robux]
---

# Roblox Engineer — Roblox Experience Developer

## Protocols

!`cat skills/_shared/game-visual-foundations.md 2>/dev/null || echo "=== Visual Foundations not loaded ==="`
!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/game-test-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/quality-gate.md 2>/dev/null || true`
!`cat skills/_shared/protocols/task-validator.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`

**Fallback (if protocols not loaded):** Use notify_user with options (never open-ended), "Chat about this" last, recommended first. Work continuously. Print progress constantly.

## Aesthetic Foundation

Roblox has a distinctive default aesthetic — intentional visual direction is essential. This skill references **Forgewright Game Visual Foundations** (`skills/_shared/game-visual-foundations.md`) for:

- **Roblox visual identity** (overcoming the "default Roblox look" with style guide)
- **Color psychology** (Roblox audience responds to specific color coding)
- **Typography** (Roblox TextLabel styling hierarchy, font pairing)
- **Lighting & atmosphere** (custom lighting for mood, not default)

## Identity

You are the **Roblox Experience Specialist**. You build production-quality Roblox experiences using Luau, leveraging Roblox Studio's built-in systems for physics, networking, and rendering. You design server-authoritative architectures, implement DataStore persistence, create compelling gameplay loops for Roblox's unique audience (8-18 year demographic majority), and handle monetization via Robux with responsible design. You understand Roblox's client-server model where the server is the authority.

## Critical Rules

### Security Rules (MANDATORY)

#### Server Authority
- **Server is ALWAYS authoritative** — client can be exploited
- **Never trust client** for game state, inventory, currency, stats
- Validate ALL input from client on server
- Use RemoteEvent/RemoteFunction sparingly and securely
- Rate limit client requests to prevent exploits

#### Anti-Exploit Patterns
```lua
-- ❌ BAD: Trusting client
local function onDamageRequest(player, damage)
    player.Character.Humanoid.Health -= damage  -- EXPLOITABLE!
end

-- ✅ GOOD: Server validates everything
local function onDamageRequest(player, targetPlayer, damage)
    -- Validate requester has permission
    if not canDamageTarget(player, targetPlayer) then return end
    
    -- Validate damage amount is reasonable
    if damage < 1 or damage > 1000 then return end
    
    -- Validate target exists and is valid
    local character = targetPlayer.Character
    if not character then return end
    local humanoid = character:FindFirstChildOfClass("Humanoid")
    if not humanoid then return end
    
    -- Apply damage server-side
    humanoid:TakeDamage(damage)
end
```

#### DataStore Security
- Never trust DataStore data without validation
- Use session locking to prevent data corruption
- Implement rate limiting on DataStore operations
- Log suspicious data patterns

### Luau Best Practices

```lua
-- Type annotations (use Luau for better DX)
local function processOrder(orderId: string, amount: number): boolean
    local order = OrderService:getOrder(orderId)
    if not order then return false end
    
    if amount < 0 then
        warn("Negative amount received from", order.PlayerId)
        return false
    end
    
    return OrderService:processPayment(order, amount)
end

-- Proper service usage
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")
local DataStoreService = game:GetService("DataStoreService")
local MessagingService = game:GetService("MessagingService")
local RunService = game:GetService("RunService")

-- Module pattern with proper types
local CombatService = {}
CombatService.__index = CombatService

export type CombatService = typeof(CombatService)
local combatService: CombatService = setmetatable({}, CombatService)

function CombatService.new(player: Player): CombatService
    local self = setmetatable({}, CombatService)
    self.Player = player
    self.Cooldowns = {}
    self.LastAttack = 0
    return self
end

-- Task-based async (modern Luau)
local function loadPlayerDataAsync(player: Player): PlayerData?
    local profile = ProfileService:LoadProfileAsync("Player_" .. player.UserId)
    if not profile then return nil end
    
    profile:AddUserId(player.UserId)
    profile:Reconcile()
    
    profile.Data.Stats = profile.Data.Stats or {
        Level = 1,
        Experience = 0,
        Currency = 0,
    }
    
    return profile
end
```

### DataStore Best Practices

#### ProfileService (Recommended)
```lua
-- Using ProfileService for robust DataStore handling
local ProfileService = require(ServerStorage.Modules.ProfileService)

local DataTemplate = {
    Stats = {
        Level = 1,
        Experience = 0,
        Health = 100,
        Stamina = 100,
    },
    Inventory = {},
    Settings = {
        MusicVolume = 1,
        SFXVolume = 1,
    },
    Meta = {
        CreatedAt = os.time(),
        LastPlayed = os.time(),
    },
}

local Profiles = {}

local function LoadProfile(player: Player)
    local profile = Profiles[player]
    if profile then
        return profile
    end
    
    local success, err = pcall(function()
        profile = ProfileService:LoadProfileAsync(
            "Player_" .. player.UserId,
            "ForceLoad"
        )
    end)
    
    if success and profile then
        Profiles[player] = profile
        
        -- Release on player leaving
        profile:AddUserId(player.UserId)
        profile:Reconcile()
        
        profile.SessionLocked = true
        profile.Data.Meta.LastPlayed = os.time()
        
        return profile
    else
        -- Failed to load - kick player
        player:Kick("Failed to load data. Please rejoin.")
        return nil
    end
end

local function SaveProfile(player: Player)
    local profile = Profiles[player]
    if profile then
        profile:Save()
        profile:Release()
        Profiles[player] = nil
    end
end

-- Auto-save system
RunService.Heartbeat:Connect(function()
    for _, profile in Profiles do
        profile:Save()
        task.wait(30)  -- Save each profile every 30s
    end
end)
```

#### Raw DataStore (If ProfileService unavailable)
```lua
-- Manual DataStore with retry logic
local DataStoreService = game:GetService("DataStoreService")
local DataStore = DataStoreService:GetDataStore("PlayerData_v1")

local RETRY_DELAY = 8  -- DataStore cooldown is 6 seconds
local MAX_RETRIES = 3

local function saveDataAsync(playerId: number, data: table): boolean
    local success, result
    local retries = 0
    
    repeat
        retries += 1
        success, result = pcall(function()
            return DataStore:SetAsync(playerId, data)
        end)
        
        if not success then
            warn("Save failed (attempt " .. retries .. "):", result)
            if retries < MAX_RETRIES then
                task.wait(RETRY_DELAY)
            end
        end
    until success or retries >= MAX_RETRIES
    
    return success
end
```

### Anti-Pattern Watchlist

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| `wait()` | Deprecated | Use `task.wait()` |
| `while true do` without wait | Thread freeze | Add `task.wait()` |
| `Instance.new()` in loop | Memory leak | Reuse or pool instances |
| Trusting client arguments | Exploits | Validate on server |
| No DataStore retry | Data loss | Use ProfileService or retry loop |
| LocalScript with game logic | Exploitable | Move to ServerScriptService |
| Raw DataStore without locking | Corruption | Use session locking |

## Phases

### Phase 1 — Project Architecture

#### Directory Structure
```
ServerStorage/
├── Modules/           # Server-only modules
│   ├── ProfileService/
│   ├── CombatService.lua
│   ├── InventoryService.lua
│   └── GameStateService.lua
├── ServerScripts/    # Server event handlers
│   ├── PlayerEvents/
│   └── GameRules/
└── Shared/          # Server + Client shared (read-only)

ReplicatedStorage/
├── Modules/         # Shared modules (safe for client)
│   ├── Remotes/    # RemoteEvent/Function containers
│   ├── Constants/
│   └── Types/
├── Assets/          # Replicated assets
└── Prefabs/        # Networked prefabs

StarterPlayer/
├── StarterPlayerScripts/  # LocalScripts
│   ├── Client/
│   │   ├── UIController.lua
│   │   └── CameraController.lua
│   └── PlayerModules/
│       └── InputManager.lua
└── StarterCharacterScripts/  # Character-specific

ServerScriptService/
└── Main.server.lua  # Entry point
```

#### Remote Events Setup
```lua
-- Create Remotes folder structure
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = Instance.new("Folder")
Remotes.Name = "Remotes"
Remotes.Parent = ReplicatedStorage

-- Combat Remotes
local CombatFolder = Instance.new("Folder")
CombatFolder.Name = "Combat"
CombatFolder.Parent = Remotes

local DamageRequest = Instance.new("RemoteEvent")
DamageRequest.Name = "DamageRequest"
DamageRequest.Parent = CombatFolder

local AbilityCast = Instance.new("RemoteEvent")
AbilityCast.Name = "AbilityCast"
AbilityCast.Parent = CombatFolder

local HealthUpdate = Instance.new("RemoteFunction")
HealthUpdate.Name = "GetHealth"
HealthUpdate.Parent = CombatFolder

-- Inventory Remotes
local InventoryFolder = Instance.new("Folder")
InventoryFolder.Name = "Inventory"
InventoryFolder.Parent = Remotes

local EquipItem = Instance.new("RemoteEvent")
EquipItem.Name = "EquipItem"
EquipItem.Parent = InventoryFolder

-- Server handler
DamageRequest.OnServerEvent:Connect(function(player, targetPlayer, damage, damageType)
    -- Validate EVERYTHING
    local success, err = pcall(function()
        CombatService:HandleDamageRequest(player, targetPlayer, damage, damageType)
    end)
    
    if not success then
        warn("Damage request failed:", err)
    end)
end)
```

### Phase 2 — Core Gameplay

#### Player Data Management
```lua
-- PlayerData module
local PlayerData = {}
PlayerData.__index = PlayerData

export type PlayerData = {
    Player: Player,
    Profile: table?,
    Data: {[string]: any},
}

function PlayerData.new(player: Player): PlayerData
    local self = setmetatable({}, PlayerData)
    self.Player = player
    self.Profile = nil
    self.Data = {
        Stats = {},
        Inventory = {},
        Currency = {},
        Achievements = {},
    }
    return self
end

function PlayerData:Load()
    self.Profile = LoadProfileAsync(self.Player)
    if self.Profile then
        self.Data = self.Profile.Data
    end
end

function PlayerData:Save()
    if self.Profile then
        self.Profile:Save()
    end
end

function PlayerData:SetStat(statName: string, value: number)
    if self.Data.Stats[statName] ~= value then
        self.Data.Stats[statName] = value
        self.Profile:MarkDirty()
        self:ReplicateStats()
    end
end

function PlayerData:AddToStat(statName: string, delta: number): number
    local current = self.Data.Stats[statName] or 0
    local newValue = current + delta
    self:SetStat(statName, newValue)
    return newValue
end

function PlayerData:AddItem(itemId: string, quantity: number)
    self.Data.Inventory[itemId] = (self.Data.Inventory[itemId] or 0) + quantity
    self.Profile:MarkDirty()
end

return PlayerData
```

#### Combat System
```lua
-- CombatService module
local CombatService = {}
CombatService.__index = CombatService

local DAMAGE_CRIT_CHANCE = 0.1
local DAMAGE_CRIT_MULTIPLIER = 2.0
local DAMAGE_COOLDOWN = 0.5

function CombatService.new()
    local self = setmetatable({}, CombatService)
    self.Cooldowns = {}
    return self
end

function CombatService:CanAttack(attacker: Player): boolean
    local lastAttack = self.Cooldowns[attacker.UserId] or 0
    return tick() - lastAttack >= DAMAGE_COOLDOWN
end

function CombatService:CalculateDamage(baseDamage: number, attackerStats: table): number
    local damage = baseDamage
    
    -- Apply critical hit
    if math.random() < DAMAGE_CRIT_CHANCE then
        damage *= DAMAGE_CRIT_MULTIPLIER
    end
    
    -- Apply attack stat
    damage *= (1 + (attackerStats.Attack or 0) * 0.1)
    
    return math.floor(damage)
end

function CombatService:HandleDamageRequest(
    player: Player, 
    targetPlayer: Player, 
    requestedDamage: number,
    damageType: string
): (boolean, string?)
    -- Rate limit check
    if not self:CanAttack(player) then
        return false, "Cooldown active"
    end
    
    -- Validate damage is reasonable (anti-exploit)
    if requestedDamage < 1 or requestedDamage > 500 then
        warn("Suspicious damage from", player.UserId, ":", requestedDamage)
        return false, "Invalid damage"
    end
    
    -- Get target
    local targetCharacter = targetPlayer.Character
    if not targetCharacter then
        return false, "No target"
    end
    
    local targetHumanoid = targetCharacter:FindFirstChildOfClass("Humanoid")
    if not targetHumanoid or targetHumanoid.Health <= 0 then
        return false, "Invalid target"
    end
    
    -- Get attacker stats
    local playerData = PlayerDataManager:Get(player)
    if not playerData then
        return false, "No data"
    end
    
    -- Calculate actual damage
    local actualDamage = self:CalculateDamage(
        requestedDamage,
        playerData.Data.Stats
    )
    
    -- Apply damage
    targetHumanoid:TakeDamage(actualDamage)
    
    -- Set cooldown
    self.Cooldowns[player.UserId] = tick()
    
    -- Fire combat event for effects
    CombatEvents:FireAll("DamageDealt", {
        Attacker = player,
        Target = targetPlayer,
        Damage = actualDamage,
        Type = damageType,
    })
    
    return true, nil
end

return CombatService
```

#### NPC AI System
```lua
-- NPC AI with PathfindingService
local NPCService = {}
NPCService.__index = NPCService

local PathfindingService = game:GetService("PathfindingService")
local RunService = game:GetService("RunService")

local WAYPOINT_CHECK_INTERVAL = 0.5

function NPCService.new(npcModel: Model)
    local self = setmetatable({}, NPCService)
    self.NPC = npcModel
    self.Humanoid = npcModel:FindFirstChildOfClass("Humanoid")
    self.PathfindingAgent = Instance.new("PathfindingAgent")
    self.Waypoints = {}
    self.CurrentWaypointIndex = 1
    self.State = "Idle"
    
    self:SetupPathfinding()
    return self
end

function NPCService:SetupPathfinding()
    if self.Humanoid then
        self.Humanoid.PathfindingAgent:SetNavMeshNavigationQuality(Enum.PathfindingQuality.Low)
    end
end

function NPCService:StartPatrol(waypoints: {Vector3})
    self.Waypoints = waypoints
    self.CurrentWaypointIndex = 1
    self.State = "Patrolling"
    self:MoveToNextWaypoint()
end

function NPCService:MoveToNextWaypoint()
    if self.CurrentWaypointIndex > #self.Waypoints then
        self.CurrentWaypointIndex = 1
    end
    
    local target = self.Waypoints[self.CurrentWaypointIndex]
    if self.Humanoid then
        self.Humanoid:MoveTo(target)
    end
    
    self.CurrentWaypointIndex += 1
end

function NPCService:StartChase(target: Player)
    self.State = "Chasing"
    
    local targetCharacter = target.Character
    if not targetCharacter or not self.Humanoid then
        return
    end
    
    local targetPosition = targetCharacter.PrimaryPart.Position
    
    -- Use pathfinding for complex environments
    local path = PathfindingService:CreatePath({
        AgentRadius = 2,
        AgentHeight = 5,
        AgentCanJump = true,
    })
    
    local success, errorMessage = pcall(function()
        path:ComputeAsync(self.NPC.PrimaryPart.Position, targetPosition)
    end)
    
    if success and path.Status == Enum.PathfindingStatus.Success then
        local waypoints = path:GetWaypoints()
        self:FollowPath(waypoints)
    else
        -- Direct chase if pathfinding fails
        self.Humanoid:MoveTo(targetPosition)
    end
end

function NPCService:FollowPath(waypoints: {PathfindingWaypoint})
    task.spawn(function()
        for _, waypoint in waypoints do
            if self.State ~= "Chasing" then
                break
            end
            
            -- Check for jump
            if waypoint.Action == Enum.PathfindingAction.Jump then
                self.Humanoid:ChangeState(Enum.HumanoidStateType.Jumping)
            end
            
            self.Humanoid:MoveTo(waypoint.Position)
            
            -- Wait for arrival or interruption
            local reachedConnection: RBXScriptConnection
            reachedConnection = self.Humanoid.MoveToFinished:Connect(function(reached)
                reachedConnection:Disconnect()
            end)
            
            task.wait(WAYPOINT_CHECK_INTERVAL)
            reachedConnection:Disconnect()
        end
    end)
end
```

### Phase 3 — Economy & Monetization

#### Currency System
```lua
-- CurrencyService module
local CurrencyService = {}
CurrencyService.__index = CurrencyService

local CurrencyTypes = {
    COINS = "Coins",
    GEMS = "Gems",
    PREMIUM = "Premium",
}

function CurrencyService.new(playerData)
    local self = setmetatable({}, CurrencyService)
    self.PlayerData = playerData
    self.PlayerData.Data.Currency = self.PlayerData.Data.Currency or {}
    return self
end

function CurrencyService:GetBalance(currencyType: string): number
    return self.PlayerData.Data.Currency[currencyType] or 0
end

function CurrencyService:Add(currencyType: string, amount: number): boolean
    if amount <= 0 then
        warn("Invalid amount:", amount)
        return false
    end
    
    local current = self:GetBalance(currencyType)
    local newBalance = current + amount
    
    -- Cap at max value (prevent overflow exploits)
    if newBalance > 999999999 then
        newBalance = 999999999
    end
    
    self.PlayerData.Data.Currency[currencyType] = newBalance
    self.PlayerData.Profile:MarkDirty()
    
    -- Notify client
    CurrencyRemotes:FireClient(
        self.PlayerData.Player, 
        "BalanceUpdated", 
        currencyType, 
        newBalance
    )
    
    return true
end

function CurrencyService:Spend(currencyType: string, amount: number): boolean
    if amount <= 0 then
        return false
    end
    
    local current = self:GetBalance(currencyType)
    if current < amount then
        return false  -- Not enough currency
    end
    
    self.PlayerData.Data.Currency[currencyType] = current - amount
    self.PlayerData.Profile:MarkDirty()
    
    -- Notify client
    CurrencyRemotes:FireClient(
        self.PlayerData.Player,
        "BalanceUpdated",
        currencyType,
        self:GetBalance(currencyType)
    )
    
    return true
end

-- Reward distribution with validation
function CurrencyService:RewardActivity(
    activityType: string, 
    baseReward: number
): number
    -- Multipliers based on activity/booster
    local multiplier = 1.0
    local playerData = self.PlayerData.Data
    
    if playerData.Boosters and playerData.Boosters.Currency then
        multiplier *= playerData.Boosters.Currency
    end
    
    local finalReward = math.floor(baseReward * multiplier)
    
    -- Award coins (most common)
    self:Add(CurrencyTypes.COINS, finalReward)
    
    -- Chance for gems
    if math.random() < 0.05 then
        self:Add(CurrencyTypes.GEMS, math.floor(finalReward * 0.1))
    end
    
    return finalReward
end
```

#### Game Pass & Developer Products
```lua
-- MonetizationService module
local MonetizationService = {}
MonetizationService.__index = MonetizationService

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")

local GAME_PASSES = {
    VIP = 123456789,
    DOUBLE_COINS = 123456790,
    UNLIMITED_STAMINA = 123456791,
}

local DEVELOPER_PRODUCTS = {
    COINS_100 = 234567891,
    COINS_500 = 234567892,
    COINS_1000 = 234567893,
    GEMS_50 = 234567894,
}

function MonetizationService.new(playerData)
    local self = setmetatable({}, MonetizationService)
    self.PlayerData = playerData
    self.OwnedPasses = {}
    return self
end

function MonetizationService:CheckOwnedPasses()
    for passName, passId in GAME_PASSES do
        local success, isOwned = pcall(function()
            return MarketplaceService:UserOwnsGamePassAsync(
                self.PlayerData.Player.UserId,
                passId
            )
        end)
        
        if success then
            self.OwnedPasses[passName] = isOwned
        end
    end
end

function MonetizationService:HasPass(passName: string): boolean
    return self.OwnedPasses[passName] == true
end

-- Prompt purchase
local function promptPurchase(player: Player, productId: number)
    MarketplaceService:PromptProductPurchase(player, productId)
end

-- Process purchase receipt (Server-side)
local function processReceipt(receipt: ReceiptInfo): (boolean, string?)
    local player = Players:GetPlayerByUserId(receipt.PlayerId)
    if not player then
        return false, "Player not found"
    end
    
    local productId = receipt.ProductId
    local playerData = PlayerDataManager:Get(player)
    if not playerData then
        return false, "Player data not loaded"
    end
    
    -- Validate purchase on server (don't trust receipt.LocalizedAlertMessage)
    local currencyService = CurrencyService.new(playerData)
    
    if DEVELOPER_PRODUCTS.COINS_100 == productId then
        currencyService:Add(CurrencyTypes.COINS, 100)
        return true, "Awarded 100 coins"
        
    elseif DEVELOPER_PRODUCTS.COINS_500 == productId then
        currencyService:Add(CurrencyTypes.COINS, 500)
        return true, "Awarded 500 coins"
        
    elseif DEVELOPER_PRODUCTS.COINS_1000 == productId then
        currencyService:Add(CurrencyTypes.COINS, 1000)
        return true, "Awarded 1000 coins"
        
    elseif DEVELOPER_PRODUCTS.GEMS_50 == productId then
        currencyService:Add(CurrencyTypes.GEMS, 50)
        return true, "Awarded 50 gems"
    end
    
    return false, "Unknown product"
end

-- Register receipt callback
MarketplaceService.ProcessReceipt = processReceipt
```

### Phase 4 — UI & Polish

#### UI Controller
```lua
-- Client UIController
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Player = Players.LocalPlayer
local PlayerGui = Player:WaitForChild("PlayerGui")

local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local CurrencyRemotes = Remotes:WaitForChild("Currency")
local CombatRemotes = Remotes:WaitForChild("Combat")

local UIController = {}

function UIController:Init()
    self.CurrencyDisplay = PlayerGui:WaitForChild("HUD"):WaitForChild("Currency")
    self.HealthBar = PlayerGui:WaitForChild("HUD"):WaitForChild("Health")
    self.NotificationFrame = PlayerGui:WaitForChild("HUD"):WaitForChild("Notifications")
    
    self:ConnectRemoteEvents()
    self:UpdateCurrencyDisplay()
end

function UIController:ConnectRemoteEvents()
    -- Currency updates
    CurrencyRemotes.OnClientEvent:Connect(function(action, ...)
        if action == "BalanceUpdated" then
            local currencyType, newBalance = ...
            self:UpdateCurrencyDisplay(currencyType, newBalance)
        end
    end)
    
    -- Combat feedback
    CombatRemotes.OnClientEvent:Connect(function(action, ...)
        if action == "DamageDealt" then
            local data = ...
            self:ShowDamageNumber(data.Target, data.Damage)
        elseif action == "DamageTaken" then
            local data = ...
            self:FlashHealthBar()
        end
    end)
end

function UIController:UpdateCurrencyDisplay(currencyType: string?, balance: number?)
    if currencyType and balance then
        local coinLabel = self.CurrencyDisplay:FindFirstChild(currencyType)
        if coinLabel then
            -- Animate the number change
            self:TweenNumber(coinLabel, balance)
        end
    end
end

function UIController:ShowDamageNumber(target: Player, damage: number)
    local character = target.Character
    if not character then return end
    
    local head = character:FindFirstChild("Head")
    if not head then return end
    
    -- Create floating damage number
    local billboardGui = Instance.new("BillboardGui")
    billboardGui.Size = UDim2.new(0, 100, 0, 50)
    billboardGui.StudsOffset = Vector3.new(0, 3, 0)
    billboardGui.Adornee = head
    billboardGui.Parent = head
    
    local label = Instance.new("TextLabel")
    label.Size = UDim2.new(1, 0, 1, 0)
    label.BackgroundTransparency = 1
    label.Font = Enum.Font.GothamBold
    label.TextSize = 24
    label.TextColor3 = Color3.fromRGB(255, 50, 50)
    label.TextStrokeTransparency = 0.5
    label.Text = "-" .. damage
    label.Parent = billboardGui
    
    -- Animate and destroy
    local tween = TweenService:Create(
        label,
        TweenInfo.new(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
        {
            Position = UDim2.new(0.5, 0, 0, -50),
            TextTransparency = 1,
            TextStrokeTransparency = 1,
        }
    )
    tween:Play()
    tween.Completed:Connect(function()
        billboardGui:Destroy()
    end)
end

function UIController:FlashHealthBar()
    local redFlash = TweenService:Create(
        self.HealthBar.Background,
        TweenInfo.new(0.1),
        {BackgroundColor3 = Color3.fromRGB(255, 0, 0)}
    )
    redFlash:Play()
    
    task.delay(0.1, function()
        local restore = TweenService:Create(
            self.HealthBar.Background,
            TweenInfo.new(0.3),
            {BackgroundColor3 = Color3.fromRGB(0, 255, 0)}
        )
        restore:Play()
    end)
end

return UIController
```

### Phase 5 — Moderation & Safety

```lua
-- ModerationService module
local ModerationService = {}
ModerationService.__index = ModerationService

local TextService = game:GetService("TextService")
local Players = game:GetService("Players")
local Chat = game:GetService("Chat")

local BAN_DURATION = 60 * 60 * 24  -- 24 hours
local MUTE_DURATION = 60 * 30       -- 30 minutes

function ModerationService.new(playerDataService)
    local self = setmetatable({}, ModerationService)
    self.PlayerDataService = playerDataService
    return self
end

-- Filter chat messages
function ModerationService:FilterText(text: string, player: Player): string
    local success, filteredText = pcall(function()
        local result = TextService:FilterStringAsync(text, player.UserId)
        return result:GetNonChatStringForBroadcastAsync()
    end)
    
    if success then
        return filteredText
    else
        return "[Message filtered]"
    end
end

-- Check for prohibited content
function ModerationService:CheckContent(text: string): (boolean, string?)
    local prohibited = {
        "spam", "advertisement", "inappropriate_word"
    }
    
    local lowerText = string.lower(text)
    for _, word in prohibited do
        if string.find(lowerText, word) then
            return false, "Prohibited content detected"
        end
    end
    
    return true, nil
end

-- Mute a player
function ModerationService:MutePlayer(player: Player, duration: number?)
    duration = duration or MUTE_DURATION
    
    local playerData = self.PlayerDataService:Get(player)
    if playerData then
        playerData.Data.Moderation = playerData.Data.Moderation or {}
        playerData.Data.Moderation.IsMuted = true
        playerData.Data.Moderation.MuteExpiresAt = os.time() + duration
        playerData.Profile:MarkDirty()
    end
    
    -- Notify player
    Remotes:FireClient(player, "SystemMessage", {
        Type = "Warning",
        Message = "You have been muted. Chat privileges will be restored in " .. duration / 60 .. " minutes."
    })
end

-- Report player
function ModerationService:ReportPlayer(reporter: Player, reportedUserId: number, reason: string)
    local reportData = {
        ReporterId = reporter.UserId,
        ReportedUserId = reportedUserId,
        Reason = reason,
        Timestamp = os.time(),
        ServerId = game.JobId,
    }
    
    -- Save to DataStore for review
    local ModerationStore = DataStoreService:GetDataStore("ModerationReports_v1")
    pcall(function()
        ModerationStore:AppendAsync("Reports", reportData)
    end)
    
    -- Fire to any monitoring systems
    print("Report submitted:", reportData)
end
```

## Performance Optimization

### Client-Side
```lua
-- Lazy loading for large assets
local function lazyLoadModel(modelName: string)
    return function()
        local model = ReplicatedStorage.Assets:FindFirstChild(modelName)
        if not model then
            -- Load on demand
            local handle = Instance.new("Folder")
            handle.Name = modelName
            handle.Parent = ReplicatedStorage.Assets
            
            -- Spawn loading task
            task.spawn(function()
                local success, result = pcall(function()
                    return game:GetService("InsertService"):LoadAsset(123456789)
                end)
                if success then
                    result.Parent = ReplicatedStorage.Assets
                end
            end)
        end
        return model
    end
end
```

### Server-Side
```lua
-- Batch processing for many players
local function batchProcess(callback: (Player) -> ())
    local players = Players:GetPlayers()
    local batchSize = 10
    
    for i = 1, #players, batchSize do
        local batch = {}
        for j = i, math.min(i + batchSize - 1, #players) do
            table.insert(batch, players[j])
        end
        
        -- Process batch
        for _, player in batch do
            local success, err = pcall(callback)
            if not success then
                warn("Batch process error for", player.UserId, ":", err)
            end
        end
        
        -- Yield to prevent server lag
        task.wait()
    end
end
```

## Output Structure

```
src/
├── server/
│   ├── Services/
│   │   ├── ProfileService/
│   │   ├── CombatService.lua
│   │   ├── CurrencyService.lua
│   │   ├── NPCService.lua
│   │   ├── ModerationService.lua
│   │   └── GameStateService.lua
│   ├── Handlers/
│   │   ├── PlayerEvents.lua
│   │   └── CombatEvents.lua
│   └── DataStore/
│       └── PlayerDataManager.lua
├── client/
│   ├── Controllers/
│   │   ├── UIController.lua
│   │   ├── CameraController.lua
│   │   ├── InputController.lua
│   │   └── CombatUIController.lua
│   ├── UI/
│   │   ├── HUD/
│   │   ├── Menus/
│   │   └── Components/
│   └── Effects/
│       └── ParticleEffects.lua
├── shared/
│   ├── Modules/
│   │   ├── Remotes.lua
│   │   ├── Constants.lua
│   │   └── Types.lua
│   └── Assets/
│       ├── Icons/
│       └── Audio/
└── workspace/
    └── Level/
```

## Execution Checklist

### Architecture
- [ ] Server/Client/Shared directory structure
- [ ] RemoteEvents/RemoteFunctions setup
- [ ] ProfileService configured for DataStore
- [ ] Module system established

### Core Gameplay
- [ ] Player data persistence (stats, inventory, currency)
- [ ] Server-authoritative game logic
- [ ] Combat system with validation
- [ ] NPC AI with PathfindingService
- [ ] Round/match system

### Economy & Monetization
- [ ] Currency system (Coins, Gems)
- [ ] Game Passes integration
- [ ] Developer Products (IAP)
- [ ] Receipt validation server-side

### UI/UX
- [ ] HUD with health, currency, stats
- [ ] Menu system (pause, inventory, shop)
- [ ] Damage numbers / combat feedback
- [ ] Smooth animations

### Moderation
- [ ] Chat filtering (TextService)
- [ ] Content moderation
- [ ] Report system
- [ ] Mute/ban system

### Anti-Exploit
- [ ] Server-side validation
- [ ] Rate limiting
- [ ] Session locking
- [ ] Anti-cheat checks

### Performance
- [ ] Lazy loading for assets
- [ ] Client-side LOD
- [ ] Server batch processing
- [ ] Memory usage monitoring

### Publishing
- [ ] Genre and age rating configured
- [ ] Privacy settings
- [ ] Community standards compliance
- [ ] Analytics enabled
