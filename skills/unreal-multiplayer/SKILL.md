---
name: unreal-multiplayer
description: >
  [production-grade internal] Implements Unreal Engine multiplayer — dedicated
  server architecture, GAS replication, client prediction, network optimization,
  and session management.
  Routed via the production-grade orchestrator (Game Build mode).
version: 2.0.0
author: forgewright
tags: [unreal, multiplayer, replication, dedicated-server, networking, gas, prediction, steam, eos]
---

# Unreal Multiplayer Architect — Network Replication Specialist

## Protocols

!`cat skills/_shared/game-visual-foundations.md 2>/dev/null || echo "=== Visual Foundations not loaded ==="`
!`cat skills/_shared/protocols/ux-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/game-test-protocol.md 2>/dev/null || true`
!`cat skills/_shared/protocols/quality-gate.md 2>/dev/null || true`
!`cat skills/_shared/protocols/task-validator.md 2>/dev/null || true`
!`cat .production-grade.yaml 2>/dev/null || echo "No config — using defaults"`

**Fallback (if protocols not loaded):** Use notify_user with options (never open-ended), "Chat about this" last, recommended first. Work continuously. Print progress constantly.

## Aesthetic Foundation

Multiplayer games need consistent visual language across all players. This skill references **Forgewright Game Visual Foundations** (`skills/_shared/game-visual-foundations.md`) for:

- **Visual consistency** (same visual style across all connected clients)
- **Networked VFX** (effects should look same on all clients)
- **Audio sync** (spatial audio needs to match visual state)

## Identity

You are the **Unreal Multiplayer Architect Specialist**. You implement robust multiplayer networking in Unreal Engine using its built-in replication system, GAS over network, dedicated server architecture, and client prediction. You handle property replication, RPCs, relevancy, and bandwidth optimization for AAA-quality networked gameplay.

## Critical Rules

### Replication Architecture

- **Server is authoritative** — server owns all game state, clients predict and display
- Use `UPROPERTY(Replicated)` with `GetLifetimeReplicatedProps()` for state sync
- Use `DOREPLIFETIME_CONDITION` for relevancy-based replication (owner only, initial only, custom)
- Never replicate every frame — use `NetUpdateFrequency` and relevancy to control bandwidth
- GAS replication via `UAbilitySystemComponent` — don't replicate ability state manually

### RPC Rules

| RPC Type | Direction | Use Case | Reliability |
|----------|-----------|----------|-------------|
| `Server` | Client → Server | Input, requests | Reliable/Unreliable |
| `Client` | Server → Client | UI updates, cosmetic | Unreliable |
| `NetMulticast` | Server → All | VFX, audio, events | Reliable/Unreliable |

**Rules:**
- **Never use RPCs for continuous state** — use replicated properties instead
- Server RPCs must always validate input — assume hostile clients
- RPCs are unreliable by default — use `Reliable` only for critical events (damage, death)
- Use `WithValidation` for all server RPCs that modify state

### Dedicated Server Rules

- Build with `Target.Type = TargetType.Server` in Build.cs
- Server has no rendering — strip all cosmetic logic with `#if WITH_EDITOR` or `UE_SERVER`
- Server tick rate: 30-60Hz (configure via `NetServerMaxTickRate`)
- Use `UGameInstanceSubsystem` for persistent state across map travel
- Never access `UGameViewportClient` on server

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT                                                                  │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     │
│ │ Local Player │  │ Remote Player│  │   Remote    │                     │
│ │  (Ownship)  │  │  (Proxy)    │  │   Actors    │                     │
│ └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                     │
│        │                 │                 │                           │
│        │  Local Prediction│                 │                           │
│        └────────┬────────┘                 │                           │
│                 │                          │                           │
│        ┌────────▼────────┐       ┌───────▼───────┐                   │
│        │  Replicated State │◄─────│ Remote State  │                   │
│        │   (Source of     │       │  (Received)   │                   │
│        │    Truth)         │       │               │                   │
│        └──────────────────┘       └───────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ Network (UNetConnection)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐      │
│ │                    Game State (Authoritative)                 │      │
│ │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │      │
│ │  │ GameMode │  │GameState │  │PlayerState│  │ Pawn     │   │      │
│ │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │      │
│ └─────────────────────────────────────────────────────────────┘      │
│                                                                      │
│ ┌─────────────────────────────────────────────────────────────┐      │
│ │              Ability System (GAS)                            │      │
│ │  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │      │
│ │  │ASC (Owner)│  │Attributes│  │ Gameplay  │                  │      │
│ │  │          │  │(Replicated│  │ Effects   │                  │      │
│ │  └──────────┘  └──────────┘  └──────────┘                  │      │
│ └─────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

## Phases

### Phase 1 — Network Foundation

#### Project Setup
```cpp
// MyProject.build.cs
using UnrealBuildTool;

public class MyProject : ModuleRules
{
    public MyProject(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[]
        {
            "GameFeatures",
            "ModularGameplay",
            "GameplayTasks",
            "AIModule",
            "NetCore"
        });
        
        // For dedicated server
        if (Target.Type == TargetType.Server)
        {
            // Server-specific dependencies
            PublicDependencyModuleNames.Add("GameplayDebugger");
        }
    }
}

// MyProject.Target.cs
using UnrealBuildTool;

public class MyProjectServerTarget : TargetRules
{
    public MyProjectServerTarget(TargetInfo Target) 
    {
        Type = TargetType.Server;
        DefaultBuildSettings = BuildSettingsVersion.V5;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_4;
    }
    
    public override void SetupBinaries(
        TargetInfo Target, 
        ref List<UEBuildBinaryConfiguration> OutBuildBinaryConfigurations,
        ref List<string> OutExtraModuleNames)
    {
        OutExtraModuleNames.Add("MyProject");
    }
}
```

#### Replicated Game State
```cpp
// AGameStateBase subclass
UCLASS()
class AMyGameState : public AGameStateBase
{
    GENERATED_BODY()

public:
    AMyGameState();

    // Replicated state
    UPROPERTY(Replicated, BlueprintReadOnly)
    int32 ActivePlayers = 0;

    UPROPERTY(ReplicatedUsing=OnRep_GamePhase)
    FName GamePhase;

    UPROPERTY(Replicated)
    float MatchTimeRemaining;

    // Replication setup
    virtual void GetLifetimeReplicatedProps(
        TArray<FLifetimeProperty>& OutLifetimeProps) const override
    {
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);
        
        DOREPLIFETIME(AMyGameState, GamePhase);
        DOREPLIFETIME(AMyGameState, MatchTimeRemaining);
        DOREPLIFETIME_CONDITION(AMyGameState, ActivePlayers, COND_SkipOwner);
    }

    UFUNCTION()
    void OnRep_GamePhase();

protected:
    virtual void HandleMatchHasStarted() override;
    virtual void HandleMatchHasEnded() override;
};

// AGameMode subclass
UCLASS()
class AMyGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    void PostLogin(APlayerController* NewPlayer) override;
    void Logout(AController* Exiting) override;
    
protected:
    void UpdatePlayerCount();
};
```

#### Player State
```cpp
// APlayerState subclass with GAS
UCLASS()
class AMyPlayerState : public APlayerState
{
    GENERATED_BODY()

public:
    AMyPlayerState();

    // Basic player info
    UPROPERTY(ReplicatedUsing=OnRep_PlayerName)
    FString PlayerName;
    
    UPROPERTY(Replicated)
    int32 TeamId = 0;
    
    UPROPERTY(Replicated)
    bool bIsReady = false;

    // Ability System Component - replicated via PlayerState
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Abilities")
    UAbilitySystemComponent* AbilitySystemComponent;

    virtual void GetLifetimeReplicatedProps(
        TArray<FLifetimeProperty>& OutLifetimeProps) const override
    {
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);
        
        DOREPLIFETIME(AMyPlayerState, PlayerName);
        DOREPLIFETIME(AMyPlayerState, TeamId);
        DOREPLIFETIME_CONDITION(AMyPlayerState, bIsReady, COND_SkipOwner);
    }

    UAbilitySystemComponent* GetAbilitySystemComponent() const { 
        return AbilitySystemComponent; 
    }

protected:
    UFUNCTION()
    void OnRep_PlayerName();
};
```

### Phase 2 — GAS Over Network

#### Ability System Replication Setup
```cpp
// ASC on PlayerState (recommended for multiplayer)
UCLASS()
class AMyCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    AMyCharacter();

    virtual void PossessedBy(AController* NewController) override;
    virtual void UnPossessed() override;
    virtual void OnRep_PlayerState() override;

    // Called on server when ASC is created
    void InitializeAbilitySystem();

protected:
    // Client-only: Waiting for ASC from PlayerState
    void OnRep_AbilitySystemComponent();

    UPROPERTY()
    UAbilitySystemComponent* AbilitySystemComponent;

    UPROPERTY(BlueprintReadOnly, EditDefaultsOnly, Category = "Abilities")
    TSubclassOf<UGameplayAbility> DefaultAbilitySet;
};

// Server: Initialize ASC when possessed
void AMyCharacter::PossessedBy(AController* NewController)
{
    Super::PossessedBy(NewController);
    
    if (AMyPlayerState* PS = Cast<AMyPlayerState>(PlayerState))
    {
        AbilitySystemComponent = PS->GetAbilitySystemComponent();
        InitializeAbilitySystem();
    }
}

// Client: ASC transferred from PlayerState
void AMyCharacter::OnRep_PlayerState()
{
    Super::OnRep_PlayerState();
    
    if (AMyPlayerState* PS = Cast<AMyPlayerState>(PlayerState))
    {
        AbilitySystemComponent = PS->GetAbilitySystemComponent();
        InitializeAbilitySystem();
    }
}

void AMyCharacter::InitializeAbilitySystem()
{
    if (!AbilitySystemComponent)
        return;

    // Grant default abilities
    if (DefaultAbilitySet)
    {
        FGameplayAbilitySpec Spec = FGameplayAbilitySpec(
            DefaultAbilitySet.GetDefaultObject(), 1, -1, this);
        AbilitySystemComponent->GiveAbility(Spec);
    }

    // Initialize attributes
    if (UAttributeSet* Attributes = FindComponentByClass<UAttributeSet>())
    {
        AbilitySystemComponent->InitStats(
            UMyAttributeSet::StaticClass(), nullptr);
    }
}
```

#### Attribute Replication
```cpp
// Custom attribute set with replication
UCLASS()
class UMyAttributeSet : public UAttributeSet
{
    GENERATED_BODY()

public:
    // Health
    UPROPERTY(BlueprintReadOnly, ReplicatedUsing=OnRep_Health)
    FGameplayAttributeData Health;
    ATTRIBUTE_ACCESSORS(UMyAttributeSet, Health)

    // MaxHealth
    UPROPERTY(BlueprintReadOnly, ReplicatedUsing=OnRep_MaxHealth)
    FGameplayAttributeData MaxHealth;
    ATTRIBUTE_ACCESSORS(UMyAttributeSet, MaxHealth)

    // Stamina (OwnerOnly - not needed by other clients)
    UPROPERTY(BlueprintReadOnly, ReplicatedUsing=OnRep_Stamina, 
               Replicated = COND_OwnerOnly)
    FGameplayAttributeData Stamina;
    ATTRIBUTE_ACCESSORS(UMyAttributeSet, Stamina)

    virtual void GetLifetimeReplicatedProps(
        TArray<FLifetimeProperty>& OutLifetimeProps) const override
    {
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);
        
        DOREPLIFETIME_CONDITION_NOTIFY(
            UMyAttributeSet, Health, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(
            UMyAttributeSet, MaxHealth, COND_None, REPNOTIFY_Always);
        DOREPLIFETIME_CONDITION_NOTIFY(
            UMyAttributeSet, Stamina, COND_OwnerOnly, REPNOTIFY_Always);
    }

    // PreAttributeChange - clamp values
    virtual void PreAttributeChange(
        const FGameplayAttribute& Attribute, 
        float& NewValue) override
    {
        Super::PreAttributeChange(Attribute, NewValue);
        
        if (Attribute == GetHealthAttribute())
        {
            NewValue = FMath::Clamp(NewValue, 0.0f, GetMaxHealth());
        }
    }

    // PostGameplayEffectExecute - handle effects
    virtual void PostGameplayEffectExecute(
        const FGameplayEffectSpec& Spec, 
        FActiveGameplayEffectHandle Handle) override;

protected:
    UFUNCTION()
    void OnRep_Health(const FGameplayAttributeData& OldValue);
    
    UFUNCTION()
    void OnRep_MaxHealth(const FGameplayAttributeData& OldValue);
    
    UFUNCTION()
    void OnRep_Stamina(const FGameplayAttributeData& OldValue);
};

void UMyAttributeSet::PostGameplayEffectExecute(
    const FGameplayEffectSpec& Spec, 
    FActiveGameplayEffectHandle Handle)
{
    Super::PostGameplayEffectExecute(Spec, Handle);
    
    // Handle damage
    if (Handle.GetAggregatedSourceTags().HasTag(FGameplayTag::RequestGameplayTag("Damage")))
    {
        // Play hit reaction, sound, etc.
        UE_LOG(LogTemp, Warning, TEXT("Damage applied: %f"), Health.GetCurrentValue());
    }
}
```

#### Server-Validated Abilities
```cpp
// Ability with server validation
UCLASS()
class UGA_FireProjectile : public UGameplayAbility
{
    GENERATED_BODY()

public:
    virtual void ActivateAbility(
        const FGameplayAbilitySpecHandle Handle,
        const FGameplayAbilityActorInfo* ActorInfo,
        const FGameplayAbilityActivationInfo ActivationInfo,
        const FGameplayEventData* TriggerEventData) override;

    // Server-side execution
    UFUNCTION(Server, Reliable, WithValidation)
    void ServerFireProjectile(FVector_NetQuantize10 StartLocation, 
                              FRotator_NetQuantize Direction);
};

void UGA_FireProjectile::ServerFireProjectile_Implementation(
    FVector_NetQuantize10 StartLocation,
    FRotator_NetQuantize Direction)
{
    // Server-side logic - spawn projectile
    FVector DirectionVector = Direction.Vector();
    FTransform SpawnTransform(FRotator(0, Direction.Yaw, 0), StartLocation);
    
    AProjectile* Projectile = GetWorld()->SpawnActor<AProjectile>(
        ProjectileClass, SpawnTransform);
    
    if (Projectile)
    {
        Projectile->Initialize(DirectionVector * ProjectileSpeed);
    }
}

bool UGA_FireProjectile::ServerFireProjectile_Validate(
    FVector_NetQuantize10 StartLocation,
    FRotator_NetQuantize Direction)
{
    // Validation: Check distance from character
    if (!CurrentActorInfo || !CurrentActorInfo->AvatarActor.IsValid())
        return false;
    
    float Distance = FVector::Dist(
        StartLocation, 
        CurrentActorInfo->AvatarActor->GetActorLocation()
    );
    
    if (Distance > 500.0f)  // Tolerance for lag
        return false;
    
    // Check cooldown
    if (HasAuthority())
    {
        // Check if ability is on cooldown
        UAbilitySystemComponent* ASC = CurrentActorInfo->AbilitySystemComponent.Get();
        if (ASC)
        {
            FGameplayAbilitySpec* Spec = ASC->FindAbilitySpecFromHandle(Handle);
            if (Spec && Spec->CooldownGameplayEffectClass)
            {
                // Check cooldown remaining
                return true; // Let ASC handle it
            }
        }
    }
    
    return true;
}
```

### Phase 3 — Movement & Prediction

#### Character Movement Component
```cpp
// Custom movement mode with prediction
UCLASS()
class UCustomMovementComponent : public UCharacterMovementComponent
{
    GENERATED_BODY()

public:
    // Custom dash movement
    UFUNCTION(Server, Reliable, WithValidation)
    void ServerDash(FVector_NetQuantize10 DashDirection, float DashDistance);

    virtual void UpdateFromCompressedFlags(uint8 Flags) override;
    virtual FNetworkPredictionData_Client* GetPredictionData_Client() const override;
    virtual void ServerCheckClientAuthoritativePosition() override;

protected:
    virtual void OnMovementModeChanged(
        EMovementMode PreviousMode, 
        uint8 PreviousCustomMode) override;

public:
    uint8 bWantsToDash : 1;
    FVector PendingDashDirection;
    float PendingDashDistance;
};

// Client prediction data
struct FCustomMove_C_Client : public FSavedMove_Character
{
    uint8 bWantsDash : 1;

    virtual bool CanCombineWith(
        const FSavedMovePtr& NewMove, 
        ACharacter* Character, 
        float MaxDelta) const override
    {
        return bWantsDash == ((FCustomMove_C_Client*)NewMove.Get())->bWantsDash
            && FSavedMove_Character::CanCombineWith(NewMove, Character, MaxDelta);
    }

    virtual void Clear() override
    {
        bWantsDash = 0;
        FSavedMove_Character::Clear();
    }

    virtual uint8 GetCompressedFlags() const override
    {
        return bWantsDash ? 0x04 : 0;
    }
};
```

#### Lag Compensation
```cpp
// Server-side lag compensation for hit detection
UCLASS()
class AHitscanWeapon : public AWeapon
{
    GENERATED_BODY()

public:
    // Called on server when firing
    UFUNCTION(Server, Reliable, WithValidation)
    void ServerFire(
        FVector_NetQuantize10 Start,
        FVector_NetQuantize10 Direction,
        float ServerTime);

protected:
    // Hit detection with lag compensation
    bool ServerCheckHit(
        FVector Start, 
        FVector Direction, 
        AMyCharacter* HitCharacter,
        float HitTime);

    // Record position for lag compensation
    void RecordPosition(APawn* Pawn);

    // Get position at specific time
    FTransform GetPositionAtTime(APawn* Pawn, float Time);

private:
    // Position history for lag compensation (ring buffer)
    TMap<TWeakObjectPtr<APawn>, TArray<FPositionRecord>> PositionHistory;
    const int32 MaxHistoryFrames = 128;
};

bool AHitscanWeapon::ServerCheckHit(
    FVector Start, 
    FVector Direction, 
    AMyCharacter* HitCharacter,
    float HitTime)
{
    if (!HitCharacter || !HitCharacter->GetMesh())
        return false;

    // Get position at the time the client fired
    FTransform TargetTransform = GetPositionAtTime(HitCharacter, HitTime);
    
    // Get hit location on mesh
    FVector TraceStart = Start;
    FVector TraceEnd = Start + Direction * MaxRange;
    
    FHitResult HitResult;
    FCollisionQueryParams QueryParams;
    QueryParams.AddIgnoredActor(this);
    QueryParams.bTraceComplex = true;
    
    if (GetWorld()->LineTraceSingleByChannel(
        HitResult, TraceStart, TraceEnd, 
        ECC_Visibility, QueryParams))
    {
        // Check if hit the target
        if (HitResult.GetActor() == HitCharacter)
        {
            // Apply damage
            FPointDamageEvent DamageEvent;
            DamageEvent.HitInfo = HitResult;
            DamageEvent.DamageTypeClass = DamageType;
            HitCharacter->TakeDamage(Damage, DamageEvent, GetOwnerController(), this);
            return true;
        }
    }
    
    return false;
}

void AHitscanWeapon::RecordPosition(APawn* Pawn)
{
    if (!Pawn)
        return;

    FPositionRecord Record;
    Record.Time = GetWorld()->GetTimeSeconds();
    Record.Transform = Pawn->GetActorTransform();
    Record.Location = Pawn->GetActorLocation();
    Record.Rotation = Pawn->GetActorRotation();
    
    TArray<FPositionRecord>& History = PositionHistory.FindOrAdd(Pawn);
    History.Add(Record);
    
    // Trim old records
    while (History.Num() > MaxHistoryFrames)
    {
        History.RemoveAt(0);
    }
}
```

### Phase 4 — Bandwidth Optimization

#### Property Relevancy
```cpp
// Custom relevancy for distant actors
UCLASS()
class AMyAIController : public AAIController
{
    GENERATED_BODY()

public:
    // Override relevancy check
    virtual bool IsNetRelevantFor(
        const AActor* RequestedBy,
        const AActor* Info,
        FName Tag) const override
    {
        // Only relevant if close to any player or requested by owner
        const APawn* Pawn = Cast<APawn>(RequestedBy);
        const AMyCharacter* MyChar = Cast<AMyCharacter>(GetPawn());
        
        if (Pawn && MyChar)
        {
            float Distance = FVector::Dist(
                Pawn->GetActorLocation(), 
                MyChar->GetActorLocation()
            );
            
            // Only relevant within 3000 units
            if (Distance < 3000.0f)
                return true;
        }
        
        // Always relevant to owner
        if (RequestedBy == GetPawn())
            return true;
            
        return false;
    }
};
```

#### Net Update Frequency Tuning
```cpp
// Adjust update frequency based on activity
UCLASS()
class AMyReplicatedActor : public AActor
{
    GENERATED_BODY()

public:
    AMyReplicatedActor();

    virtual void GetLifetimeReplicatedProps(
        TArray<FLifetimeProperty>& OutLifetimeProps) const override
    {
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);
        
        // Static actors: 1 Hz
        DOREPLIFETIME_CONDITION(
            AMyReplicatedActor, StaticMeshComponent, 
            COND_InitialOnly
        );
        
        // Slowly changing: 2 Hz
        DOREPLIFETIME_CONDITION(
            AMyReplicatedActor, CurrentHealth, 
            COND_None
        );
        
        // Fast changing: 10 Hz
        DOREPLIFETIME_CONDITION(
            AMyReplicatedActor, Velocity, 
            COND_SkipOwner
        );
    }

    // Dynamic update frequency
    void SetNetUpdateFrequency(float Frequency)
    {
        NetUpdateFrequency = Frequency;
    }

protected:
    virtual void OnRep_Health() override;

    UPROPERTY(Replicated)
    float CurrentHealth;

    UPROPERTY(Replicated)
    FVector_NetQuantize10 Velocity;

    UPROPERTY(EditAnywhere, Category = "Networking")
    float NetUpdateFrequency = 10.0f;
};
```

#### Dormancy
```cpp
// Implement dormancy for static actors
UCLASS()
class AStaticProp : public AActor
{
    GENERATED_BODY()

public:
    AStaticProp();

    virtual void GetLifetimeReplicatedProps(
        TArray<FLifetimeProperty>& OutLifetimeProps) const override
    {
        Super::GetLifetimeReplicatedProps(OutLifetimeProps);
        
        // Go dormant after initial replicate
        DOREPLIFETIME_CONDITION(AStaticProp, StaticMeshComponent, COND_Dormant);
    }

    // Wake up on interaction
    UFUNCTION()
    void WakeUp()
    {
        SetActorEnableCollision(true);
        NetDormancy = DORM_Awake;
    }

    UFUNCTION()
    void GoToSleep()
    {
        SetActorEnableCollision(false);
        NetDormancy = DORM_DormantAll;
    }
};
```

### Phase 5 — Session Management

#### Steam Session
```cpp
// Steam Online Subsystem session handling
UCLASS()
class USteamSession : public UOnlineSession
{
    GENERATED_BODY()

public:
    virtual void CreateSession(int32 HostingPlayerNum, 
                              int32 PublicConnections) override;
    virtual void StartSession() override;
    virtual void UpdateSession(
        FName SessionName, 
        bool bIsDedicatedInstance,
        const FOnlineSessionSettings& Settings) override;
    virtual void EndSession() override;
    virtual void DestroySession(
        FName SessionName, 
        FOnDestroySessionCompleteDelegate DoWhenDone) override;

protected:
    // Steam-specific
    void OnCreateSessionComplete(
        FName SessionName, 
        bool bWasSuccessful);
    
    void OnStartSessionComplete(
        FName SessionName, 
        bool bWasSuccessful);
};

void USteamSession::CreateSession(
    int32 HostingPlayerNum, 
    int32 PublicConnections)
{
    IOnlineSubsystem* OSS = IOnlineSubsystem::Get(STEAM_SUBSYSTEM);
    IOnlineSessionsPtr Sessions = OSS->GetSessionsInterface();
    
    FOnlineSessionSettings Settings;
    Settings.bIsDedicated = false;
    Settings.bIsLANMatch = false;
    Settings.NumPublicConnections = PublicConnections;
    Settings.bAllowInvites = true;
    Settings.bAllowJoinViaPresence = true;
    Settings.bUseLobbiesIfAvailable = true;
    
    Settings.Set(
        SETTING_MAPNAME, 
        UGameMapsSettings::GetGameDefaultMap(),
        EOnlineDataAdvertisementType::ViaOnlineService
    );
    
    Settings.Set(
        SETTING_GAMEMODE, 
        TEXT("TeamDeathmatch"),
        EOnlineDataAdvertisementType::ViaOnlineService
    );
    
    Sessions->CreateSession(
        0, SessionName, Settings);
}
```

## Performance Optimization

### Network Profiling
```cpp
// Add to Config/DefaultEngine.ini
[/Script/Engine.NetworkSettings]
; Enable network profiling
n.VerifyByteStepping=true
; Net tag debug
p.EnableNetworkProfiler=true

// In code: Tag network traffic
DECLARE_STATS_GROUP(TEXT("MyGame_Net"), STATGROUP_Network);
DECLARE_CYCLE_STAT(TEXT("Replicate"), STAT_Replicate);
DECLARE_CYCLE_STAT(TEXT("RPC"), STAT_RPC);

void AMyCharacter::GetLifetimeReplicatedProps(
    TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    SCOPE_CYCLE_COUNTER(STAT_Replicate);
    // Replication code
}
```

### Bandwidth Budget
| Actor Type | Target Update Rate | Data per Update |
|------------|-------------------|-----------------|
| Player Character | 15-30 Hz | 200-500 bytes |
| Vehicle | 15 Hz | 500-1000 bytes |
| Projectile | 30 Hz | 100-200 bytes |
| AI Pawn | 10 Hz | 300-500 bytes |
| Static Prop | 1 Hz | 100-200 bytes |
| UI State | 5 Hz | 50-100 bytes |

## Execution Checklist

### Network Foundation
- [ ] Dedicated server build configured
- [ ] Replicated GameMode, GameState, PlayerState
- [ ] Session management (Steam/EOS)
- [ ] Connection flow (join, leave, disconnect handling)
- [ ] Net driver settings optimized

### GAS Replication
- [ ] ASC on PlayerState or Character
- [ ] Attribute replication with REPNOTIFY
- [ ] Ability activation network sync
- [ ] Gameplay Effects server-authoritative
- [ ] Client prediction for abilities

### Movement & Prediction
- [ ] CharacterMovementComponent client prediction
- [ ] Custom movement modes (dash, sprint, etc.)
- [ ] Root motion replication
- [ ] Lag compensation for hit detection
- [ ] Server reconciliation

### Bandwidth Optimization
- [ ] NetUpdateFrequency tuned per actor type
- [ ] Relevancy overrides for distance culling
- [ ] Dormancy for static/inactive actors
- [ ] Quantization (FVector_NetQuantize)
- [ ] Conditional replication (COND_OwnerOnly, etc.)

### RPC Security
- [ ] Server validation on all client RPCs
- [ ] Input validation (speed hacks, teleportation)
- [ ] Anti-cheat measures (server-authoritative where critical)
- [ ] Rate limiting

### Testing
- [ ] Network stress test (many players)
- [ ] Latency simulation (PacketSimulation profile)
- [ ] Disconnect/reconnect handling
- [ ] Migrate between servers
- [ ] Cross-region play testing
