---
name: unity-shader-artist
description: "Orchestrates Unity-specific graphics rendering pipelines, HLSL/Cg shader scripting, Shader Graph configurations, and GPU performance optimizations. Use when the user requests custom visual effects, post-processing filters, vertex/fragment shaders, procedural material designs, or lighting model integrations for URP, HDRP, or Built-in Render Pipelines."
version: 1.0.0
---

# Unity Shader Artist (LITE)

## SOLVE Step 2: GROUND (Unity Shader Artist Domain Slots)
| Assumption | Check command / file read | Result | Script-produced evidence |
|---|---|---|---|
| Target render pipeline (URP, HDRP, or Built-in) is defined in dependencies | `cat Packages/manifest.json \| grep -E "(render-pipeline\|core-pipeline)"` | ... | run the check command and paste output |
| Existing shader assets, HLSL libraries, or Shader Graphs are indexed | `find Assets/ -name "*.shader" -o -name "*.hlsl" -o -name "*.shadergraph"` | ... | run the check command and paste output |

## SOLVE Step 3: DECOMPOSE (Unity Shader Artist Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Analyze shader property mappings, rendering passes, and blending states | Verify properties exist in the inspector, subshader tags match the target pipeline queue (e.g., Transparent), and fallbacks are set.
2. COMPILE | Implement vertex and fragment shading operations in HLSL/ShaderLab | Ensure math calculations use optimized GPU operations and avoid dynamic branch conditions inside the fragment kernel.
3. OPTIMIZE | Reduce register pressure and multi-pass draw overhead via precision scoping | Confirm floating-point precisions (float, half, fixed) are bounded correctly to maximize performance on mobile/XR devices.

## Common Mistakes Checklist
- **Magenta Shader Fallback Failure**: Attempting to compile legacy Built-in Multi-pass shaders in modern Universal Render Pipeline (URP) configurations, resulting in immediate renderer failures and hot pink/magenta materials.
- **Dynamic Branching in Pixel Shaders**: Overusing conditional loops (`for`) or dynamic branching (`if`) inside fragment functions instead of leveraging step functions (`step`, `lerp`, `smoothstep`), stalling GPU threads.
- **Unbounded Precision Bloat**: Standardizing all HLSL vectors as 32-bit `float` instead of utilizing `half` (16-bit) for normals/UVs or `fixed` (11-bit) for colors, leading to high register usage and memory bandwidth bottlenecks.
- **Ignoring Depth Testing & Queue Sorting**: Omitting the correct `"Queue"="Transparent"` tag or `"IgnoreProjector"="True"` settings on transparent materials, producing depth sorting bugs.
- **Non-Compliant File Names**: Storing custom shader specifications or architectural logs under `docs/` using CamelCase or spaces instead of strictly lowercase kebab-case (e.g., `docs/02-architecture/PostProcessShader.md` instead of `docs/02-architecture/post-process-shader.md`).

### Step 1: Ground active rendering pipeline configuration
```bash
cat Packages/manifest.json | grep -E "(render-pipeline)"
```

### Step 2: Implement a high-performance, URP-compliant holographic shader in `Assets/Shaders/Hologram.shader`
```hlsl
Shader "Custom/URPHologram"
{
    Properties
    {
        _MainTex ("Albedo Texture", 2D) = "white" {}
        [HDR] _GlowColor ("Glow Color", Color) = (0.0, 1.0, 1.0, 1.0)
        _FringePower ("Fringe Intensity", Range(0.1, 5.0)) = 2.0
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "RenderPipeline"="UniversalPipeline" }
        LOD 100
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off

        Pass
        {
            Name "Unlit"
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS   : POSITION;
                float3 normalOS     : NORMAL;
                float2 uv           : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS   : SV_POSITION;
                float3 viewDirWS    : TEXCOORD1;
                float3 normalWS     : NORMAL;
                float2 uv           : TEXCOORD0;
            };

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);

            CBUFFER_START(UnityPerMaterial)
                float4 _MainTex_ST;
                half4 _GlowColor;
                half _FringePower;
            CBUFFER_END

            Varyings vert(Attributes input)
            {
                Varyings output;
                // Transform position to clip space
                VertexPositionInputs positionInputs = GetVertexPositionInputs(input.positionOS.xyz);
                output.positionCS = positionInputs.positionCS;

                // Safe: Transform normal and track view direction
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.viewDirWS = GetWorldSpaceViewDir(TransformObjectToWorld(input.positionOS.xyz).xyz);
                output.uv = TRANSFORM_TEX(input.uv, _MainTex);
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                half4 texColor = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, input.uv);

                // Vector-safe calculations for Fresnel effect (Fringe power)
                half3 normal = normalize(input.normalWS);
                half3 viewDir = normalize(input.viewDirWS);
                half fresnel = 1.0 - saturate(dot(normal, viewDir));
                fresnel = pow(fresnel, _FringePower);

                // Blend colors using half precision to minimize register footprint
                half4 finalColor = texColor * _GlowColor;
                finalColor.a = saturate(fresnel * _GlowColor.a);
                return finalColor;
            }
            ENDHLSL
        }
    }
    FallBack "Hidden/Universal Render Pipeline/FallbackError"
}
```
