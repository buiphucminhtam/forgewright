# Coordinate Display Gizmo - Unity

> An editor tool for Unity that displays real-time coordinate information for selected objects.

## Features

- Display Transform position, rotation, scale
- Show distance from origin
- Precision warning when coordinates are large (>5000 units)
- Copy coordinates to clipboard
- Works in Play and Edit mode

## Installation

1. Copy `CoordinateGizmo.cs` to `Assets/Editor/` folder
2. Access via `Window > Coordinate Gizmo`

## Usage

```
Menu: Window > Coordinate Gizmo
Shortcut: Ctrl+Shift+G (Edit mode)
```

## Code

```csharp
// CoordinateGizmo.cs
// Place in Assets/Editor/ folder

using UnityEngine;
using UnityEditor;
using System.Text;

public class CoordinateGizmo : EditorWindow
{
    private bool showPosition = true;
    private bool showRotation = true;
    private bool showScale = true;
    private bool showDistance = true;
    private float warningThreshold = 5000f;
    private float criticalThreshold = 10000f;
    
    [MenuItem("Window/Coordinate Gizmo")]
    public static void ShowWindow()
    {
        GetWindow<CoordinateGizmo>("Coords");
    }
    
    void OnGUI()
    {
        GUILayout.Label("Coordinate Display", EditorStyles.boldLabel);
        
        EditorGUILayout.Space();
        
        // Get selected transform
        Transform target = Selection.activeTransform;
        
        if (target == null)
        {
            EditorGUILayout.HelpBox("Select a GameObject", MessageType.Info);
            return;
        }
        
        EditorGUILayout.Space();
        
        // Position
        if (showPosition)
        {
            DrawPosition(target);
        }
        
        // Distance from origin
        if (showDistance)
        {
            DrawDistance(target);
        }
        
        // Rotation
        if (showRotation)
        {
            DrawRotation(target);
        }
        
        // Scale
        if (showScale)
        {
            DrawScale(target);
        }
        
        EditorGUILayout.Space();
        
        // Options
        EditorGUILayout.LabelField("Options", EditorStyles.boldLabel);
        showPosition = EditorGUILayout.Toggle("Show Position", showPosition);
        showRotation = EditorGUILayout.Toggle("Show Rotation", showRotation);
        showScale = EditorGUILayout.Toggle("Show Scale", showScale);
        showDistance = EditorGUILayout.Toggle("Show Distance", showDistance);
        
        warningThreshold = EditorGUILayout.FloatField("Warning Threshold", warningThreshold);
        criticalThreshold = EditorGUILayout.FloatField("Critical Threshold", criticalThreshold);
        
        EditorGUILayout.Space();
        
        // Copy button
        if (GUILayout.Button("Copy Position"))
        {
            string pos = $"{target.position.x:F3}, {target.position.y:F3}, {target.position.z:F3}";
            EditorGUIUtility.systemCopyBuffer = pos;
            Debug.Log($"Copied: {pos}");
        }
    }
    
    void DrawPosition(Transform target)
    {
        EditorGUILayout.LabelField("Position", EditorStyles.boldLabel);
        
        EditorGUI.BeginChangeCheck();
        
        Vector3 pos = EditorGUILayout.Vector3Field("World", target.position);
        
        if (EditorGUI.EndChangeCheck())
        {
            Undo.RecordObject(target, "Position Change");
            target.position = pos;
        }
        
        EditorGUI.BeginChangeCheck();
        Vector3 localPos = EditorGUILayout.Vector3Field("Local", target.localPosition);
        if (EditorGUI.EndChangeCheck())
        {
            Undo.RecordObject(target, "Local Position Change");
            target.localPosition = localPos;
        }
        
        // Precision warning
        float distance = target.position.magnitude;
        if (distance > criticalThreshold)
        {
            GUI.backgroundColor = Color.red;
            EditorGUILayout.HelpBox(
                $"CRITICAL: {distance:F0} units from origin. Precision issues likely!",
                MessageType.Error
            );
            GUI.backgroundColor = Color.white;
        }
        else if (distance > warningThreshold)
        {
            GUI.backgroundColor = Color.yellow;
            EditorGUILayout.HelpBox(
                $"WARNING: {distance:F0} units from origin. Monitor precision.",
                MessageType.Warning
            );
            GUI.backgroundColor = Color.white;
        }
    }
    
    void DrawDistance(Transform target)
    {
        EditorGUILayout.LabelField("Distance from Origin", EditorStyles.boldLabel);
        
        float distance = target.position.magnitude;
        
        string distText = $"{distance:F2} units";
        EditorGUILayout.LabelField("Distance", distText);
        
        // Progress bar visualization
        float normalized = Mathf.Clamp01(distance / criticalThreshold);
        EditorGUI.ProgressBar(normalized, $"Precision Health: {(1f - normalized) * 100:F0}%");
        
        EditorGUILayout.Space();
    }
    
    void DrawRotation(Transform target)
    {
        EditorGUILayout.LabelField("Rotation", EditorStyles.boldLabel);
        
        EditorGUI.BeginChangeCheck();
        Vector3 rot = EditorGUILayout.Vector3Field("Local", target.localEulerAngles);
        if (EditorGUI.EndChangeCheck())
        {
            Undo.RecordObject(target, "Rotation Change");
            target.localEulerAngles = rot;
        }
        
        // Quaternion display (read-only)
        EditorGUILayout.LabelField("Quaternion");
        EditorGUI.BeginDisabledGroup(true);
        Quaternion q = target.rotation;
        EditorGUILayout.Vector3Field("World (Quat)", new Vector3(q.x, q.y, q.z));
        EditorGUI.EndDisabledGroup();
    }
    
    void DrawScale(Transform target)
    {
        EditorGUILayout.LabelField("Scale", EditorStyles.boldLabel);
        
        EditorGUI.BeginChangeCheck();
        Vector3 scale = EditorGUILayout.Vector3Field("Local", target.localScale);
        if (EditorGUI.EndChangeCheck())
        {
            Undo.RecordObject(target, "Scale Change");
            target.localScale = scale;
        }
        
        EditorGUILayout.LabelField("Lossy Scale",
            $"{target.lossyScale.x:F3}, {target.lossyScale.y:F3}, {target.lossyScale.z:F3}");
    }
}
```

## Scene View Integration

To add coordinate display directly in the Scene view:

```csharp
// CoordinateOverlay.cs - Add to Assets/Editor/
using UnityEngine;
using UnityEditor;

[InitializeOnLoad]
public class CoordinateOverlay
{
    static CoordinateOverlay()
    {
        EditorApplication.update += OnUpdate;
    }
    
    static void OnUpdate()
    {
        // Only in edit mode
        if (!Application.isPlaying && SceneView.lastActiveSceneView != null)
        {
            SceneView.lastActiveSceneView.Repaint();
        }
    }
    
    [DrawGizmo(GizmoType.Selected | GizmoType.NonSelected)]
    static void DrawCoordGizmo(Transform target, GizmoType gizmoType)
    {
        if (!EditorApplication.isPlaying)
        {
            // Draw coordinate info as gizmo label
            Vector3 pos = target.position;
            string label = $"{pos.x:F1}, {pos.y:F1}, {pos.z:F1}";
            
            GUIStyle style = new GUIStyle();
            style.normal.textColor = Color.white;
            style.fontSize = 10;
            style.alignment = TextAnchor.MiddleLeft;
            
            Vector3 screenPos = HandleUtility.GUIPointToWorldRay(
                Event.current.mousePosition
            ).GetPoint(1f);
            
            // Only draw when selected
            if (Selection.activeTransform == target)
            {
                Handles.Label(pos + Vector3.up * 0.5f, label, style);
            }
        }
    }
}
```

## See Also

- [Coordinate System Docs](../../coordinate-systems/cheatsheet.md)
- [Floating Origin Guide](../../guides/floating-origin.md)
