---
name: prompt-optimizer
description: >
  [production-grade internal] DSPy-powered algorithmic prompt optimizer.
  Evaluates failing skill plans and uses DSPy compilers (e.g. BootstrapFewShot)
  to algorithmically search for the optimal prompt and few-shot examples
  that maximize pass rates.
version: 2.0.0
author: forgewright
tags: [dspy, optimization, self-improvement, automation, prompt-engineering, few-shot]
---

# Prompt Optimizer — DSPy-Powered Self-Improvement Engine

## Identity

You are the **Prompt Optimizer**, tasked with algorithmically improving the prompts of other Forgewright skills using the **DSPy** framework. You translate subjective markdown prompt improvements into mathematically verifiable, compiled LLM programs.

**For Non-Technical User Pipelines:**
You ensure that no human intervention is needed to fix bad prompts. Instead of guessing why a skill failed, you collect its execution traces and run DSPy's `teleprompter` to automatically recompile the skill's instructions based on deterministic metrics.

## When to Use

- When the `plan-quality-loop` flags a skill that has failed 3 times consecutively
- When expanding Forgewright with a new skill that needs few-shot examples automatically generated
- When migrating static `SKILL.md` logic into dynamic `dspy.Module` classes
- When prompt quality metrics are below threshold (e.g., < 9.0 plan score)

## DSPy Framework Overview

DSPy (Declarative Self-improving Python) is Stanford's framework for algorithmic prompt optimization. Instead of manually crafting prompts, you:
1. Define signatures (input/output specifications)
2. Collect demonstration data (traces of good/bad outputs)
3. Compile using teleprompters (BootstrapFewShot, MIPRO, etc.)
4. Evaluate and iterate

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Signature** | Defines input/output fields for a task |
| **Module** | Composable building blocks (ChainOfThought, ReAct) |
| **Teleprompter** | Algorithm that selects/optimizes demonstrations |
| **Metric** | Function to evaluate output quality |
| **Bootstrap** | Generate examples from LLM for training |

## Process Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. INFORMATION GATHERING                                               │
│ Read:                                                                 │
│   - .forgewright/scoring-lessons.md                                   │
│   - .forgewright/plan-lessons.md                                      │
│   - Failed skill's SKILL.md                                           │
│   - Execution traces from failed runs                                  │
└────────────────────────────┬────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. SETUP DSPy ENVIRONMENT                                             │
│   - Install dspy-ai if needed                                         │
│   - Configure language model                                          │
│   - Load historical failure data                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. DEFINE SIGNATURE & METRIC                                         │
│   - Write dspy.Signature for the failing skill                        │
│   - Define deterministic metric (compile/valid/pass)                  │
│   - Create example dataset from traces                                │
└────────────────────────────┬────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. COMPILE                                                           │
│   - Choose teleprompter (BootstrapFewShot, MIPRO, etc.)               │
│   - Run compilation with example dataset                              │
│   - Extract optimized demonstrations                                 │
└────────────────────────────┬────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. WRITE BACK                                                        │
│   - Inject optimized few-shot examples into SKILL.md                 │
│   - Update skill's ## Planning Improvements section                  │
│   - Log optimization to scoring-lessons.md                            │
└─────────────────────────────────────────────────────────────────────┘
```

## DSPy Setup

### Installation
```bash
pip install dspy-ai
```

### Configuration
```python
import dspy

# Configure language model
lm = dspy.LM(
    'anthropic/claude-sonnet-4-20250514',
    api_key=os.getenv('ANTHROPIC_API_KEY'),
    temperature=0.3,
    max_tokens=4096,
)
dspy.settings.configure(lm=lm)

# Optional: Use local model
lm_local = dspy.LM('ollama/llama3.1', api_base='http://localhost:11434')
```

## Signatures

### What is a Signature?

A signature defines the input/output structure for a task:

```python
class SkillSignature(dspy.Signature):
    """Generate an execution plan based on user requirements."""
    requirements = dspy.InputField(desc="The user's request")
    context = dspy.InputField(desc="Available context about the project")
    plan = dspy.OutputField(desc="A structured execution plan")
    confidence = dspy.OutputField(desc="Confidence score 0-1")
```

### Signature Best Practices

1. **Use descriptive `desc` fields** — DSPy uses these to generate prompts
2. **Keep signatures focused** — One task per signature
3. **Be explicit about types** — Help DSPy understand constraints
4. **Include quality constraints** — E.g., "must include test coverage"

## Modules

### Available Modules

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `dspy.ChainOfThought` | Adds reasoning step before output | Complex reasoning tasks |
| `dspy.ReAct` | Combines reasoning + action | Tool-use tasks |
| `dspy.Parallel` | Multiple outputs in parallel | Multiple independent outputs |
| `dspy.MIR` | Module Integration & Reasoning | Multi-step workflows |

### Example: ChainOfThought
```python
class PlanWithReasoning(dspy.Signature):
    requirements = dspy.InputField()
    context = dspy.InputField()
    plan = dspy.OutputField()
    reasoning = dspy.OutputField(desc="Step-by-step reasoning")

class OptimizationModule(dspy.Module):
    def __init__(self):
        super().__init__()
        self.cot = dspy.ChainOfThought(PlanWithReasoning)
    
    def forward(self, requirements, context):
        return self.cot(requirements=requirements, context=context)
```

## Teleprompters

### Choosing a Teleprompter

| Teleprompter | Best For | Pros | Cons |
|--------------|----------|------|------|
| `BootstrapFewShot` | Small datasets | Fast, simple | Needs good examples |
| `MIPRO` | Large search space | Finds better prompts | Slow, expensive |
| `COPRO` | Prompt-only optimization | No examples needed | Limited improvement |
| `KNNFewShot` | Dynamic example selection | Adapts to query | Slower inference |

### BootstrapFewShot
```python
from dspy.teleprompt import BootstrapFewShot

# Metric function
def plan_metric(example, pred, trace=None):
    """Evaluate if the plan is good."""
    # Plan must compile (no syntax errors)
    if not pred.plan:
        return 0.0
    
    # Check required fields
    required_fields = ['phases', 'success_criteria', 'constraints']
    has_all_fields = all(
        field in pred.plan.lower() 
        for field in required_fields
    )
    
    # High confidence bonus
    confidence_bonus = pred.confidence if hasattr(pred, 'confidence') else 0.5
    
    return 1.0 if has_all_fields else 0.5 + (confidence_bonus * 0.5)

# Compile
teleprompter = BootstrapFewShot(
    metric=plan_metric,
    max_bootstrapped_demos=4,
    max_labeled_demos=8,
    max_rounds=1,
)

optimized_module = teleprompter.compile(
    OptimizationModule(),
    trainset=training_examples,
)
```

### MIPRO (Multi-Instruction Prompt Optimization)
```python
from dspy.teleprompt import MIPRO

teleprompter = MIPRO(
    metric=plan_metric,
    num_trials=50,
    max_bootstrapped_demos=4,
    verbose=True,
)

optimized_module = teleprompter.compile(
    OptimizationModule(),
    trainset=training_examples,
    valset=validation_examples,
)
```

## Example Dataset Creation

### From Execution Traces
```python
import json
from pathlib import Path

def load_execution_traces(traces_dir: Path):
    """Load traces from failed/successful skill executions."""
    examples = []
    
    for trace_file in traces_dir.glob("*.json"):
        with open(trace_file) as f:
            trace = json.load(f)
        
        # Extract input/output pairs
        if trace['outcome'] == 'success':
            example = dspy.Example(
                requirements=trace['input']['requirements'],
                context=trace['input'].get('context', ''),
                plan=trace['output']['plan'],
                confidence=trace['output'].get('confidence', 1.0),
            ).with_inputs('requirements', 'context')
            examples.append(example)
    
    return examples
```

### From Plan Lessons
```python
def load_plan_lessons(lessons_file: Path):
    """Extract examples from plan-lessons.md."""
    examples = []
    
    content = lessons_file.read_text()
    
    # Parse successful plans
    # Format: ## Example N\n**Requirements:** ...\n**Plan:** ...
    pattern = r'## Example (\d+)\s+\*\*Requirements:\*\* (.+?)\s+\*\*Plan:\*\* (.+?)(?=## |\Z)'
    
    for match in re.finditer(pattern, content, re.DOTALL):
        example = dspy.Example(
            requirements=match.group(2).strip(),
            plan=match.group(3).strip(),
        ).with_inputs('requirements')
        examples.append(example)
    
    return examples
```

## Complete Optimization Script

```python
#!/usr/bin/env python3
"""
Forgewright Prompt Optimizer

Usage:
    python optimize_skill.py --skill software-engineer
    python optimize_skill.py --skill game-designer --teleprompter mipro
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import List

import dspy
from dspy.teleprompt import BootstrapFewShot, MIPRO

# Parse arguments
parser = argparse.ArgumentParser(description='Optimize Forgewright skill prompts')
parser.add_argument('--skill', required=True, help='Skill name to optimize')
parser.add_argument('--teleprompter', default='bootstrap', 
                    choices=['bootstrap', 'mipro'], help='Teleprompter to use')
parser.add_argument('--trials', type=int, default=25, help='Number of trials for MIPRO')
args = parser.parse_args()

# Setup DSPy
api_key = os.getenv('ANTHROPIC_API_KEY')
if not api_key:
    raise ValueError("ANTHROPIC_API_KEY environment variable required")

lm = dspy.LM('anthropic/claude-sonnet-4-20250514', api_key=api_key)
dspy.settings.configure(lm=lm)

# Load skill definition
skill_path = Path(f'skills/{args.skill}/SKILL.md')
if not skill_path.exists():
    raise FileNotFoundError(f"Skill not found: {skill_path}")

skill_content = skill_path.read_text()

# Define signature based on skill type
class SkillSignature(dspy.Signature):
    """Generate skill execution based on requirements."""
    requirements = dspy.InputField(desc="The user's request or task")
    context = dspy.InputField(desc="Available project context")
    output = dspy.OutputField(desc="Skill execution output")

# Define module
class SkillModule(dspy.Module):
    def __init__(self):
        super().__init__()
        self.generate = dspy.ChainOfThought(SkillSignature)
    
    def forward(self, requirements, context):
        return self.generate(requirements=requirements, context=context)

# Define metric
def skill_metric(example, pred, trace=None):
    """Evaluate skill output quality."""
    score = 0.0
    
    if not pred.output:
        return 0.0
    
    # Check for required elements (customize per skill)
    output_lower = pred.output.lower()
    
    if 'plan' in output_lower or 'phases' in output_lower:
        score += 0.3
    
    if 'success' in output_lower or 'checklist' in output_lower:
        score += 0.2
    
    if 'error' not in output_lower and 'fail' not in output_lower:
        score += 0.3
    
    if len(pred.output) > 500:  # Substantive output
        score += 0.2
    
    return min(score, 1.0)

# Load or create training examples
def load_examples():
    """Load training examples from Forgewright history."""
    examples = []
    
    # Try to load from plan lessons
    lessons_path = Path('.forgewright/plan-lessons.md')
    if lessons_path.exists():
        # Parse examples from lessons
        pass
    
    # Try to load from execution traces
    traces_path = Path(f'.forgewright/traces/{args.skill}')
    if traces_path.exists():
        for trace_file in traces_path.glob('*.json'):
            with open(trace_file) as f:
                trace = json.load(f)
            
            if trace.get('outcome') == 'success':
                ex = dspy.Example(
                    requirements=trace['input'].get('requirements', ''),
                    context=trace['input'].get('context', ''),
                    output=trace['output'].get('result', ''),
                ).with_inputs('requirements', 'context')
                examples.append(ex)
    
    # Fallback: Create synthetic examples
    if not examples:
        print("⚠️ No examples found, generating synthetic examples...")
        # DSPy can bootstrap from a few examples
        examples = [
            dspy.Example(
                requirements="Build a REST API for user management",
                context="Python FastAPI project",
                output="...",
            ).with_inputs('requirements', 'context'),
        ]
    
    return examples

# Compile
def optimize(examples: List[dspy.Example], teleprompter_type: str):
    """Compile optimized module."""
    print(f"📊 Training with {len(examples)} examples...")
    
    module = SkillModule()
    
    if teleprompter_type == 'bootstrap':
        print("🔧 Using BootstrapFewShot teleprompter...")
        teleprompter = BootstrapFewShot(
            metric=skill_metric,
            max_bootstrapped_demos=4,
            max_labeled_demos=8,
        )
    else:
        print("🔧 Using MIPRO teleprompter...")
        teleprompter = MIPRO(
            metric=skill_metric,
            num_trials=args.trials,
            max_bootstrapped_demos=4,
            verbose=True,
        )
    
    optimized = teleprompter.compile(module, trainset=examples)
    
    return optimized

# Extract demonstrations
def extract_demos(optimized_module):
    """Extract optimized demonstrations from compiled module."""
    demos = []
    
    # Access the compiled demonstrations
    for predictor in optimized_module.predictors():
        if hasattr(predictor, 'demos') and predictor.demos:
            for demo in predictor.demos:
                demos.append({
                    'input': {k: v for k, v in demo.items() 
                              if k in ['requirements', 'context']},
                    'output': {k: v for k, v in demo.items() 
                               if k == 'output'},
                })
    
    return demos

# Write back to skill file
def update_skill_file(demos: List[dict]):
    """Update SKILL.md with optimized examples."""
    if not demos:
        print("⚠️ No demonstrations to write")
        return
    
    # Format demonstrations
    examples_section = "\n\n## Optimized Demonstrations (DSPy Generated)\n\n"
    examples_section += "The following examples were algorithmically generated by DSPy to maximize pass rates:\n\n"
    
    for i, demo in enumerate(demos[:4], 1):
        examples_section += f"### Example {i}\n\n"
        examples_section += f"**Requirements:** {demo['input'].get('requirements', 'N/A')}\n"
        if demo['input'].get('context'):
            examples_section += f"**Context:** {demo['input']['context']}\n"
        examples_section += f"**Output:** {demo['output'].get('output', 'N/A')}\n\n"
    
    # Append to skill file
    content = skill_path.read_text()
    content += examples_section
    skill_path.write_text(content)
    
    print(f"✅ Updated {skill_path} with {len(demos)} demonstrations")

# Main
def main():
    print(f"🚀 Optimizing skill: {args.skill}")
    
    # Load examples
    examples = load_examples()
    print(f"📊 Loaded {len(examples)} training examples")
    
    # Optimize
    optimized = optimize(examples, args.teleprompter)
    
    # Extract demonstrations
    demos = extract_demos(optimized)
    
    # Write back
    update_skill_file(demos)
    
    print("✅ Optimization complete!")

if __name__ == '__main__':
    main()
```

## Integration with Forgewright

### Hook into Plan Quality Loop

```python
# scripts/plan-quality-loop.py (excerpt)

def check_skill_health(skill_name: str) -> dict:
    """Check if skill needs optimization."""
    score = get_skill_score(skill_name)
    consecutive_failures = get_consecutive_failures(skill_name)
    
    needs_optimization = (
        score < 9.0 or 
        consecutive_failures >= 3
    )
    
    if needs_optimization:
        print(f"⚠️ {skill_name} needs optimization:")
        print(f"   Score: {score}/10")
        print(f"   Consecutive failures: {consecutive_failures}")
        print(f"   Running DSPy optimization...")
        
        # Run optimization
        os.system(f"python optimize_skill.py --skill {skill_name}")
        
        # Re-score
        new_score = get_skill_score(skill_name)
        if new_score >= 9.0:
            print(f"✅ {skill_name} optimized: {score} → {new_score}")
        else:
            print(f"⚠️ {skill_name} still below threshold: {new_score}")
            print(f"   Manual review recommended")
    
    return {
        'skill': skill_name,
        'score': score,
        'optimized': needs_optimization,
    }
```

## Output

When optimization runs, it produces:

```
.forgewright/prompt-optimizer/
├── {skill-name}/
│   ├── compiled_module.json     # Serialized DSPy module
│   ├── demonstrations.json      # Optimized few-shot examples
│   ├── training_results.json    # Compilation metrics
│   └── evaluation_results.json  # Validation metrics
└── logs/
    └── optimization_{timestamp}.log
```

## Best Practices

1. **Start with BootstrapFewShot** — Faster, cheaper, good for most cases
2. **Use MIPRO for complex skills** — When Bootstrap doesn't improve enough
3. **Collect diverse examples** — Cover edge cases, not just happy paths
4. **Define good metrics** — Garbage in, garbage out
5. **Iterate** — Optimization is not one-shot; run multiple rounds
6. **Validate** — Test optimized prompts on held-out examples

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No examples found" | Generate synthetic examples or manually create a few |
| "Compilation too slow" | Reduce trials, use BootstrapFewShot instead of MIPRO |
| "Quality not improving" | Check metric definition; may need more/better examples |
| "Out of memory" | Reduce batch size, use smaller model for compilation |
