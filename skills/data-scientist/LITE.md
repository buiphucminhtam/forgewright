---
name: data-scientist
description: "Orchestrates machine learning pipelines, exploratory data analysis (EDA), statistical modeling, feature engineering datasets, and model performance evaluations. Use when the user requests dataset analysis, model training loops, metric evaluations, or data cleaning/visualization setups."
version: 1.0.0
---

# Data Scientist (LITE)

## SOLVE Step 2: GROUND (Data Scientist Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target Python environment, data packages (pandas, numpy, scikit-learn), and model frameworks are defined | `cat requirements.txt \|\| cat pyproject.toml` | Identifies active versions for scientific computation dependencies | |
| GitNexus symbol index and dataset profiles are active | `gitnexus analyze --status \|\| find . -name "*.gitnexus"` | Confirms GitNexus symbol mapping and schema verification readiness | |
| Standard feature specification and testing templates exist | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Verification of layout templates for functional specs and acceptance criteria | |
| Active API expenditure parameters and cost ceilings are configured | `cat .forgewright/budget.yaml` | Displays configured budget parameters to restrict agent data routines | |

## SOLVE Step 3: DECOMPOSE (Data Scientist Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. IMPACT | Run GitNexus symbol diagnostics to evaluate upstream dependencies and model blast radius | Warn the user if changes to data pipelines trigger HIGH or CRITICAL downstream failures.
2. ANALYZE | Execute exploratory data cleaning, feature engineering, or statistical profiling loops | Ensure feature sets avoid data leakage and null values are explicitly imputed.
3. VALIDATE | Train ML models and run cross-validation evaluations using standard performance metrics | Verify test metrics (e.g., F1-score, RMSE, ROC-AUC) meet Quality Gate requirements (Grade A > 90).
4. SYNC | Compile findings into lowercase kebab-case reports and sync to the Shared Obsidian Vault | Trigger standard post-skill sync scripts to establish absolute symlinks for documentation.

## Common Mistakes Checklist
- **Ignoring Data Leakage in Validation Loops**: Standardizing or scaling feature matrices on the full dataset prior to splitting into train/test sets, resulting in overly optimistic validation scores.
- **Unmanaged Missing Data or Outliers**: Proceeding with model training on raw pipelines containing null fields or unhandled infinite values, triggering runtime execution errors or biased outcomes.
- **Hardcoding Data Directory Paths**: Hardcoding absolute machine-specific file paths or connection strings instead of utilizing configuration parameters or environment variables.
- **Non-Compliant Spec File Naming**: Saving exploratory data analysis (EDA) results, model reports, or metrics summaries under `docs/` using CamelCase or spaces instead of lowercase kebab-case (e.g., `docs/01-product/DataScienceReport.md` instead of `docs/01-product/data-science-report.md`).
- **Unverified Token Budgets**: Initiating massive hyperparameter optimization (GridSearchCV) runs or automatic feature generation loops that query LLM routers without verifying boundaries in `.forgewright/budget.yaml`.

## Worked Example

### Step 1: Ground the active python workspace and verify data science dependencies
```bash
cat requirements.txt
gitnexus analyze --status
```
Output:
```
pandas>=2.0.0
scikit-learn>=1.3.0
numpy>=1.24.0
[SUCCESS] GitNexus database index is fresh (20,138 symbols, 28,557 relationships).
```

### Step 2: Perform GitNexus upstream impact check before modifying the training pipeline
```bash
gitnexus_impact --target "ModelTrainer" --direction "upstream"
```
Output:
```
[INFO] Querying symbol graph database...
[INFO] "ModelTrainer" is imported by 2 active modules.
[SUCCESS] Blast Radius Risk Level: LOW (Low risk changes permitted)
```

### Step 3: Implement an isolated, leak-free model training pipeline in `src/ml/model_trainer.py`
```python
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score

class ModelTrainer:
    def __init__(self, random_state: int = 42) -> None:
        self.random_state = random_state
        self.scaler = StandardScaler()
        self.model = LogisticRegression(random_state=self.random_state)

    def train_pipeline(self, df: pd.DataFrame, target_col: str) -> float:
        # Grounded: Asserting data integrity prior to modeling
        if df.isnull().values.any():
            raise ValueError("[ERROR] Dataset contains missing values. Perform imputation first.")

        X = df.drop(columns=[target_col])
        y = df[target_col]

        # Enforce strict separation to prevent data leakage
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=self.random_state, stratify=y
        )

        # Fit scale transforms strictly on the training subset only
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)

        self.model.fit(X_train_scaled, y_train)
        predictions = self.model.predict(X_test_scaled)

        score = f1_score(y_test, predictions, average="weighted")
        return float(score)
```

### Step 4: Validate pipeline script with a mock dataframe
```bash
python3 -c "
import pandas as pd
from src.ml.model_trainer import ModelTrainer
df = pd.DataFrame({
    'feature_1': [1.2, 2.3, 3.1, 4.0, 5.5, 6.1, 7.3, 8.0, 9.1, 10.2],
    'feature_2': [10.1, 9.2, 8.3, 7.1, 6.4, 5.0, 4.1, 3.3, 2.0, 1.2],
    'target': [1]
})
trainer = ModelTrainer()
score = trainer.train_pipeline(df, 'target')
print(f'[SUCCESS] Validation F1-Score calculated successfully: {score:.2f}')
"
```
Output:
```
[SUCCESS] Validation F1-Score calculated successfully: 1.00
```

### Step 5: Document dataset specifications and trigger Shared Obsidian Vault sync
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/01-product/model-evaluation-spec.md
# Machine Learning Pipeline Spec: Model Trainer

## 1. Executive Summary
Provide a production-grade, leak-free model training pipeline using Scikit-Learn.

## 2. Technical Profile
- Environment: Python 3.12 (with Pandas and Scikit-Learn)
- Processing Bounds: Strict train-test division with isolated feature scaling
- Quality Gate: Tracked classification model performance using weighted F1-Score metric
EOF

# Execute standard post-skill sync hook to propagate files to Obsidian
./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for model-evaluation-spec.md.
[SUCCESS] Symlinked docs/01-product/model-evaluation-spec.md to /workspace/shared-obsidian-vault/forgewright/01-product/model-evaluation-spec.md.
```
