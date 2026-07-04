---
name: unreal-engineer
description: "Orchestrates Unreal Engine C++ development, Blueprint integrations, scene actors, component lifecycles, and build tool compilations. Use when the user requests Unreal Engine gameplay mechanics, custom C++ UCLASS/UPROPERTY declarations, custom actor systems, or automated project compilation setups."
version: 1.0.0
---

# Unreal Engineer (LITE)

## SOLVE Step 2: GROUND (Unreal Engineer Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Active Unreal project configuration file exists | `find . -maxdepth 2 -name "*.uproject"` | ... | run the check command and paste output |
| Project-specific tech stack and profile settings are active | `cat .forgewright/project-profile.json` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Unreal Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Validate C++ codebase files, reflection patterns, and plugin configurations | Ensure that C++ class definitions match target Unreal Build Tool formats and generated headers exist.
2. IMPLEMENT | Author or update player movement and physics calculations with delta-time scaling | Verify that calculations in `Tick(float DeltaTime)` apply the `DeltaTime` multiplier to preserve frame-rate parity.
3. GC_SAFE | Declare raw pointer pointers to custom UObjects utilizing GC-retained macros | Enforce that object references are flagged with `UPROPERTY()` or tracked via `TWeakObjectPtr` to prevent GC dangling crashes.

## Common Mistakes Checklist
- **Garbage Collection Crashes**: Storing raw unmanaged pointers to `UObject` derivatives in C++ class structures without designating them as `UPROPERTY()`, allowing the engine to sweep and deallocate active objects.
- **FPS-Dependent Tick Scaling**: Computing transformations or adding vector forces inside the `Tick()` callback without scaling inputs by `DeltaTime`, causing movement speed variance on differing hardware refresh rates.
- **Corrupted Generated Headers**: Placing include directives for custom files below `#include "MyClass.generated.h"` inside headers, causing Unreal Header Tool (UHT) parsing and compilation blocks.
- **Non-Compliant File Structures**: Creating custom actor plans or specs under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/01-product/PlayerMovementSpec.md` instead of `docs/01-product/player-movement-spec.md`).

### Step 1: Ground the target game configurations
```bash
find . -maxdepth 2 -name "*.uproject"
cat .forgewright/project-profile.json
```

### Step 2: Implement a memory-safe, frame-independent player controller C++ class
Create `Source/MyGame/Public/MyPlayerCharacter.h`:
```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "MyPlayerCharacter.generated.h" // Enforces proper UHT placement

UCLASS()
class MYGAME_API AMyPlayerCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    AMyPlayerCharacter();

protected:
    virtual void BeginPlay() override;

public:
    virtual void Tick(float DeltaTime) override;

    // GC-tracked properties safe from memory corruption
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Movement")
    float BaseSpeed;
};
```

Create `Source/MyGame/Private/MyPlayerCharacter.cpp`:
```cpp
#include "MyPlayerCharacter.h"

AMyPlayerCharacter::AMyPlayerCharacter()
{
    PrimaryActorTick.bCanEverTick = true;
    BaseSpeed = 500.0f;
}

void AMyPlayerCharacter::BeginPlay()
{
    Super::BeginPlay();
    UE_LOG(LogTemp, Log, TEXT("[FORGEWRIGHT] Local player initialized safely."));
}

void AMyPlayerCharacter::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    // Scale vectors frame-independently with DeltaTime
    float ForwardInput = GetInputAxisValue("MoveForward");
    if (FMath::Abs(ForwardInput) > 0.01f)
    {
        FVector Direction = GetActorForwardVector();
        AddMovementInput(Direction, BaseSpeed * ForwardInput * DeltaTime);
    }
}
```
