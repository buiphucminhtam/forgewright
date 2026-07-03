using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace Forgewright.Gameplay
{
    /// <summary>
    /// Professional State-Machine Combat Controller for Unity.
    /// Implements input buffering, combo string sequence, recovery windows, and cancel thresholds
    /// necessary for satisfying and fluid mid-core melee games.
    /// </summary>
    public class CombatStateMachineUnity : MonoBehaviour
    {
        public enum CombatState
        {
            Idle,
            Attacking,
            Recovery,
            Stunned
        }

        [System.Serializable]
        public struct AttackStage
        {
            public string animTriggerName;
            public float activeDuration;      // Duration where hitboxes are active
            public float cancelWindowStart;  // Time from start where animation can be canceled into a dodge/next attack
            public float recoveryDuration;    // Recovery animation lag where player is vulnerable
            public float damageMultiplier;
        }

        [Header("Combo Chain Configuration")]
        [SerializeField] private List<AttackStage> comboStages;
        [SerializeField] private float inputBufferWindow = 0.25f; // Seconds to buffer next attack input

        [Header("State Telemetry")]
        [SerializeField] private CombatState currentState = CombatState.Idle;
        [SerializeField] private int currentComboIndex = 0;

        private bool attackBuffered = false;
        private float lastAttackInputTime = 0f;
        private Coroutine activeCombatSequence;

        private Animator animator;

        public event Action<int, float> OnAttackTriggered; // (comboIndex, damageMultiplier)
        public event Action OnCombatRecoveryEntered;

        private void Awake()
        {
            animator = GetComponent<Animator>();
            if (comboStages == null || comboStages.Count == 0)
            {
                SetupDefaultComboStages();
            }
        }

        private void Update()
        {
            if (currentState == CombatState.Stunned) return;

            // 1. Capture and buffer input
            if (Input.GetButtonDown("Fire1") || Input.GetKeyDown(KeyCode.J))
            {
                lastAttackInputTime = Time.time;
                attackBuffered = true;
            }

            // 2. State-machine tick
            TickCombatState();
        }

        private void TickCombatState()
        {
            if (currentState == CombatState.Idle && attackBuffered)
            {
                // Trigger first combo attack
                TriggerComboAttack(0);
            }
        }

        private void TriggerComboAttack(int index)
        {
            if (activeCombatSequence != null) StopCoroutine(activeCombatSequence);

            attackBuffered = false; // Reset buffer
            currentComboIndex = index;
            activeCombatSequence = StartCoroutine(AttackSequenceCoroutine(index));
        }

        private IEnumerator AttackSequenceCoroutine(int index)
        {
            currentState = CombatState.Attacking;
            AttackStage stage = comboStages[index];

            // Trigger animation
            if (animator != null)
            {
                animator.SetTrigger(stage.animTriggerName);
            }

            // Emit hit callback
            OnAttackTriggered?.Invoke(index, stage.damageMultiplier);

            float stageTime = 0f;
            bool transitionedToNext = false;

            while (stageTime < stage.activeDuration)
            {
                stageTime += Time.deltaTime;

                // Check if cancel into next attack is allowed & requested
                if (stageTime >= stage.cancelWindowStart && attackBuffered)
                {
                    // Check if input is still fresh/buffered
                    if (Time.time - lastAttackInputTime <= inputBufferWindow)
                    {
                        int nextIndex = (index + 1) % comboStages.Count;
                        transitionedToNext = true;
                        TriggerComboAttack(nextIndex);
                        yield break;
                    }
                }
                yield return null;
            }

            if (!transitionedToNext)
            {
                // Enter recovery phase
                currentState = CombatState.Recovery;
                OnCombatRecoveryEntered?.Invoke();
                yield return new WaitForSeconds(stage.recoveryDuration);

                // Reset combo chain and return to idle
                currentComboIndex = 0;
                currentState = CombatState.Idle;
            }
        }

        public void ApplyStun(float duration)
        {
            if (activeCombatSequence != null) StopCoroutine(activeCombatSequence);
            currentState = CombatState.Stunned;
            currentComboIndex = 0;
            attackBuffered = false;
            
            if (animator != null)
            {
                animator.Play("Stun");
            }

            Invoke(nameof(EndStun), duration);
        }

        private void EndStun()
        {
            if (currentState == CombatState.Stunned)
            {
                currentState = CombatState.Idle;
            }
        }

        private void SetupDefaultComboStages()
        {
            comboStages = new List<AttackStage>
            {
                new AttackStage { animTriggerName = "Attack1", activeDuration = 0.3f, cancelWindowStart = 0.2f, recoveryDuration = 0.15f, damageMultiplier = 1.0f },
                new AttackStage { animTriggerName = "Attack2", activeDuration = 0.35f, cancelWindowStart = 0.25f, recoveryDuration = 0.15f, damageMultiplier = 1.2f },
                new AttackStage { animTriggerName = "Attack3", activeDuration = 0.5f, cancelWindowStart = 0.4f, recoveryDuration = 0.3f, damageMultiplier = 1.8f }
            };
        }
    }
}
