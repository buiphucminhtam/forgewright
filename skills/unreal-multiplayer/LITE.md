---
name: unreal-multiplayer
description: "Orchestrates Unreal Engine-specific multiplayer networking implementations, client-server replication, RPC routing, network authority, replication conditions, and server-side state validations. Use when the user requests multiplayer gameplay features, network replication, Server/Client/Multicast RPCs, dedicated server configurations, or network bandwidth optimizations in Unreal Engine C++ or Blueprints."
version: 1.0.0
---

# Unreal Multiplayer (LITE)

## SOLVE Step 2: GROUND (Unreal Multiplayer Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Active Unreal project configuration file exists | `find . -maxdepth 2 -name "*.uproject"` | ... | run the check command and paste output |
| Project-specific tech stack and profile settings are active | `cat .forgewright/project-profile.json` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Unreal Multiplayer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Analyze network ownership, replication conditions, and property replication specs | Verify variables use `Replicated` or `ReplicatedUsing` and lifetime replication is registered in `GetLifetimeReplicatedProps`.
2. SYNCHRONIZE | Author C++ network methods utilizing UFUNCTION validation specifiers | Ensure Server RPCs utilize `WithValidation` to prevent arbitrary client injection or cheating.
3. CONSTRAIN | Manage actor spawning, network roles, and NetUpdateFrequency parameters | Confirm multiplayer actor spawning occurs authoritatively on the server via `SpawnActor`.

## Common Mistakes Checklist
- **Missing GetLifetimeReplicatedProps Registration**: Declaring properties as replicated (`UPROPERTY(Replicated)`) without registering them in `GetLifetimeReplicatedProps()`, resulting in silent replication failures.
- **Client-Authoritative Server RPCs without Validation**: Creating Server RPCs without using the `WithValidation` specifier tag, allowing compromised client packets to execute malicious logic on the server without validation checks.
- **Spamming Multicast RPCs**: Invoking Multicast RPCs for high-frequency events (like tick-based movement or rotation updates) instead of utilizing smoothed replicated variables, causing immediate network congestion.
- **Non-Compliant Resource Directories**: Storing network documentation or specs under `docs/` using CamelCase instead of strictly lowercase kebab-case (e.g., `docs/01-product/MultiplayerSetup.md` instead of `docs/01-product/multiplayer-setup.md`).

### Step 1: Ground target project settings
```bash
find . -maxdepth 2 -name "*.uproject"
cat .forgewright/project-profile.json
```

### Step 2: Implement a server-authoritative, validated health replication script
Create `Source/MyGame/Public/MyNetCharacter.h`:
```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "MyNetCharacter.generated.h"

UCLASS()
class MYGAME_API AMyNetCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    AMyNetCharacter();

    // Required for replicating variables
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

    UPROPERTY(ReplicatedUsing = OnRep_Health, BlueprintReadOnly, Category = "Health")
    float Health;

    UFUNCTION()
    void OnRep_Health();

    // Server RPC with validation to safely adjust health
    UFUNCTION(Server, Reliable, WithValidation)
    void Server_ApplyDamage(float DamageAmount);
};
```

Create `Source/MyGame/Private/MyNetCharacter.cpp`:
```cpp
#include "MyNetCharacter.h"
#include "Net/UnrealNetwork.h"

AMyNetCharacter::AMyNetCharacter()
{
    bReplicates = true;
    Health = 100.0f;
}

void AMyNetCharacter::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
    Super::GetLifetimeReplicatedProps(OutLifetimeProps);
    // Enforce variable replication condition
    DOREPLIFETIME(AMyNetCharacter, Health);
}

void AMyNetCharacter::OnRep_Health()
{
    UE_LOG(LogTemp, Log, TEXT("[NETWORK] Health replicated to client. Current: %f"), Health);
}

bool AMyNetCharacter::Server_ApplyDamage_Validate(float DamageAmount)
{
    // Reject negative damages or unrealistic values
    return DamageAmount >= 0.0f && DamageAmount <= 1000.0f;
}

void AMyNetCharacter::Server_ApplyDamage_Implementation(float DamageAmount)
{
    if (HasAuthority())
    {
        Health = FMath::Max(0.0f, Health - DamageAmount);
    }
}
```
