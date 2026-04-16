using System;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Floating Origin for Unity
/// Handles large world coordinates and prevents floating-point precision issues.
/// Attach to an empty GameObject in the scene.
/// </summary>
public class FloatingOrigin : MonoBehaviour
{
    #region Singleton
    
    private static FloatingOrigin _instance;
    private static bool _hasInstance;
    
    public static FloatingOrigin Instance
    {
        get
        {
            if (_instance == null && !_hasInstance)
            {
                _instance = FindObjectOfType<FloatingOrigin>();
                _hasInstance = true;
            }
            return _instance;
        }
    }
    
    public static bool HasInstance => _instance != null;
    
    #endregion
    
    #region Events
    
    public event Action<Vector3, Vector3> OnOriginShift;
    public event Action<Vector3> OnPreShift;
    public event Action<Vector3> OnPostShift;
    
    #endregion
    
    #region Configuration
    
    [Header("Configuration")]
    [Tooltip("Distance from origin to trigger a shift")]
    public float Threshold = 5000f;
    
    [Tooltip("Enable/disable floating origin")]
    public bool Enabled = true;
    
    [Tooltip("Use smooth interpolation for shifts")]
    public bool SmoothShift = false;
    
    [Tooltip("Interpolation speed when SmoothShift is enabled")]
    public float ShiftSpeed = 10f;
    
    [Tooltip("Print debug information")]
    public bool DebugMode = false;
    
    #endregion
    
    #region Private Fields
    
    private Vector3 _worldOffset = Vector3.zero;
    private Vector3 _targetOffset = Vector3.zero;
    private Transform _player;
    private bool _isShifting;
    
    // Track transforms that need to be shifted
    private readonly HashSet<Transform> _trackedTransforms = new();
    
    #endregion
    
    #region Unity Lifecycle
    
    private void Awake()
    {
        if (_instance != null && _instance != this)
        {
            Destroy(gameObject);
            return;
        }
        
        _instance = this;
        _hasInstance = true;
    }
    
    private void Start()
    {
        // Track all children of this object
        UpdateTrackedChildren();
        
        if (DebugMode)
        {
            Debug.Log($"[FloatingOrigin] Initialized with threshold: {Threshold}");
        }
    }
    
    private void Update()
    {
        if (!Enabled || _player == null)
            return;
        
        // Check if player has exceeded threshold
        float distanceFromOrigin = _player.position.magnitude;
        
        if (distanceFromOrigin > Threshold)
        {
            // Calculate new offset to keep player near origin
            _targetOffset = -_player.position;
            
            if (SmoothShift)
            {
                // Smooth interpolation
                _isShifting = true;
            }
            else
            {
                // Immediate shift
                PerformShift(_targetOffset);
                _isShifting = false;
            }
        }
        
        if (SmoothShift && _isShifting)
        {
            // Interpolate towards target
            _worldOffset = Vector3.MoveTowards(
                _worldOffset,
                _targetOffset,
                ShiftSpeed * Time.deltaTime * 1000f
            );
            
            ApplyOffset(_worldOffset);
            
            // Check if we've reached the target
            if (Vector3.Equals(_worldOffset, _targetOffset))
            {
                PerformShift(_targetOffset);
                _isShifting = false;
            }
        }
    }
    
    private void FixedUpdate()
    {
        if (_isShifting)
        {
            SyncPhysics();
        }
    }
    
    #endregion
    
    #region Core Methods
    
    private void PerformShift(Vector3 newOffset)
    {
        if (Vector3.Equals(newOffset, _worldOffset))
            return;
        
        Vector3 oldOffset = _worldOffset;
        
        // Emit pre-shift event (for chunk loading)
        OnPreShift?.Invoke(newOffset);
        
        if (DebugMode)
        {
            Debug.Log($"[FloatingOrigin] Shifting from {oldOffset} to {newOffset}");
        }
        
        // Apply the new offset
        _worldOffset = newOffset;
        ApplyOffset(_worldOffset);
        
        // Sync physics to prevent collision drift
        SyncPhysics();
        
        // Emit post-shift event (for chunk unloading)
        OnPostShift?.Invoke(oldOffset);
        
        // Emit main event
        OnOriginShift?.Invoke(oldOffset, newOffset);
    }
    
    private void ApplyOffset(Vector3 offset)
    {
        // Move all tracked transforms to counteract the offset
        foreach (Transform t in _trackedTransforms)
        {
            if (t != null)
            {
                t.position += (offset - _worldOffset);
            }
        }
        
        // Also move our own transform
        transform.position = offset;
    }
    
    private void SyncPhysics()
    {
        // Force physics server to sync with new positions
        Physics.SyncTransforms();
    }
    
    private void UpdateTrackedChildren()
    {
        _trackedTransforms.Clear();
        
        foreach (Transform child in transform)
        {
            _trackedTransforms.Add(child);
        }
    }
    
    #endregion
    
    #region Public API
    
    /// <summary>
    /// Set the player transform that determines when to shift
    /// </summary>
    public void SetPlayer(Transform player)
    {
        _player = player;
        
        if (DebugMode)
        {
            Debug.Log($"[FloatingOrigin] Player set: {player?.name}");
        }
    }
    
    /// <summary>
    /// Track a transform manually
    /// </summary>
    public void TrackTransform(Transform t)
    {
        if (t != null && !_trackedTransforms.Contains(t))
        {
            _trackedTransforms.Add(t);
            
            if (DebugMode)
            {
                Debug.Log($"[FloatingOrigin] Tracking: {t.name}");
            }
        }
    }
    
    /// <summary>
    /// Stop tracking a transform
    /// </summary>
    public void UntrackTransform(Transform t)
    {
        if (t != null)
        {
            _trackedTransforms.Remove(t);
            
            if (DebugMode)
            {
                Debug.Log($"[FloatingOrigin] Untracking: {t.name}");
            }
        }
    }
    
    /// <summary>
    /// Get current world offset
    /// </summary>
    public Vector3 WorldOffset => _worldOffset;
    
    /// <summary>
    /// Convert world position to local (relative to origin)
    /// </summary>
    public Vector3 ToLocal(Vector3 worldPos)
    {
        return worldPos - _worldOffset;
    }
    
    /// <summary>
    /// Convert local position to world
    /// </summary>
    public Vector3 ToWorld(Vector3 localPos)
    {
        return localPos + _worldOffset;
    }
    
    /// <summary>
    /// Force an origin shift
    /// </summary>
    public void ForceShift()
    {
        if (_player != null)
        {
            _targetOffset = -_player.position;
            PerformShift(_targetOffset);
        }
    }
    
    /// <summary>
    /// Reset to origin
    /// </summary>
    public void Reset()
    {
        PerformShift(Vector3.zero);
    }
    
    /// <summary>
    /// Get distance from origin
    /// </summary>
    public float GetDistanceFromOrigin()
    {
        return _player != null ? _player.position.magnitude : transform.position.magnitude;
    }
    
    /// <summary>
    /// Check if currently shifting
    /// </summary>
    public bool IsShifting => _isShifting;
    
    /// <summary>
    /// Set threshold at runtime
    /// </summary>
    public void SetThreshold(float newThreshold)
    {
        Threshold = newThreshold;
        
        if (DebugMode)
        {
            Debug.Log($"[FloatingOrigin] Threshold set to: {Threshold}");
        }
    }
    
    /// <summary>
    /// Get number of tracked transforms
    /// </summary>
    public int TrackedCount => _trackedTransforms.Count;
    
    #endregion
    
    #region Debug
    
    private void OnDrawGizmosSelected()
    {
        if (!DebugMode) return;
        
        // Draw threshold sphere
        Gizmos.color = Color.yellow;
        Gizmos.DrawWireSphere(Vector3.zero, Threshold);
        
        // Draw current offset
        Gizmos.color = Color.green;
        Gizmos.DrawWireSphere(_worldOffset, 100f);
    }
    
    #endregion
}
