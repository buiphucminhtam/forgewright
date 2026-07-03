---
name: xlsx-engineer
description: "Orchestrates Excel/spreadsheet file generation, cell formatting styles, mathematical formula insertions, multi-sheet workbook consolidation, and data summary pipelines. Use when the user requests automated Excel workbook creation, tabular data formatting, financial/metrics calculations, or data export tasks."
version: 1.0.0
---

# Xlsx Engineer (LITE)

## SOLVE Step 2: GROUND (Xlsx Engineer Domain Slots)
| Assumption | Check command / file read | Result | VERIFIED? |
|---|---|---|---|
| Target spreadsheet and data processing dependencies are installed [1] | `cat requirements.txt \|\| cat pyproject.toml` | Identifies active Excel-related packages (e.g., `openpyxl`, `pandas`, `xlsxwriter`) | |
| Project-specific tech stack and baseline profile configurations are active [1, 2] | `cat .forgewright/project-profile.json` | Displays onboarded tech stacks (e.g., Python, Node.js) and status | |
| Standard feature specs and BDD-first testing templates exist [3] | `cat docs/01-product/TEMPLATE-FEATURE-SPEC.md` | Ensures design specifications conform to the standard layout format | |
| Active API expenditure parameters and cost ceilings are configured [4] | `cat .forgewright/budget.yaml` | Verifies current session spend limits and warning thresholds | |

## SOLVE Step 3: DECOMPOSE (Xlsx Engineer Domain Slots)
Format: `n. ACTION | TARGET | CHECK`

1. AUDIT | Validate input data schemas, tabular layout limits, and data types | Ensure that input structures don't contain corrupt records or unmapped columns.
2. CONSTRUCT | Generate Excel sheets, apply formatting styles (fills, alignments, borders), and insert formula cells | Confirm that all math blocks utilize dynamic uppercase formulas rather than hardcoded metrics.
3. VALIDATE | Run programmatic integrity audits and check if the generated binary file opens cleanly | Ensure files compile without structure warnings and columns autosize correctly to prevent truncation.
4. SYNC | Save specifications as lowercase kebab-case under docs/ and run the sync-obsidian hook [3, 5] | Trigger standard post-skill sync hooks to establish absolute symlinks to the Shared Obsidian Vault.

## Common Mistakes Checklist
- **Hardcoding Formula Outputs**: Inserting static values into calculation cells instead of dynamic Excel formulas (e.g., writing `150` instead of `=SUM(B2:B5)`), breaking sheet interactivity.
- **Truncated Cell Outputs (`###` Errors)**: Failing to dynamically calculate column width metrics relative to the maximum length of values in each column, causing visual text clipping.
- **Inconsistent Theme & Style Guides**: Applying disjointed colors, border styles, or fonts across multiple workbook sheets instead of standard uniform templates.
- **Non-Compliant File Names**: Saving spreadsheet outputs, templates, or specification logs under `docs/` using CamelCase instead of lowercase kebab-case (e.g., `docs/01-product/MonthlyReport.xlsx` instead of `docs/01-product/monthly-report.xlsx`) [3].
- **Unverified Token Budgets**: Initiating massive multi-sheet data translations or recursive cell analyzer runs without verifying session limits in `.forgewright/budget.yaml` [4].

## Worked Example

### Step 1: Ground the active Python environment and check for spreadsheet libraries
```bash
cat requirements.txt | grep -E "(openpyxl|pandas)"
cat .forgewright/project-profile.json
```
Output:
```
openpyxl>=3.1.2
pandas>=2.2.0
{
  "project_name": "forgewright-xlsx-service",
  "tech_stack": ["Python", "openpyxl"],
  "health_status": "PASS"
}
```

### Step 2: Implement an automated, formatted Excel workbook builder in `scripts/build-report.py`
```python
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

def create_formatted_report(filename: str):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sales Summary"
    
    # 1. Title Block
    ws.merge_cells("A1:C1")
    ws["A1"] = "Monthly Performance Metrics"
    ws["A1"].font = Font(name="Arial", size=14, bold=True, color="FFFFFF")
    ws["A1"].fill = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
    ws["A1"].alignment = Alignment(horizontal="center")
    
    # 2. Headers
    headers = ["Product ID", "Quantity Sold", "Revenue"]
    ws.append([]) # Empty spacing row
    ws.append(headers)
    
    header_row = 3
    for col in range(1, 4):
        cell = ws.cell(row=header_row, column=col)
        cell.font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="2F5597", end_color="2F5597", fill_type="solid")
        cell.alignment = Alignment(horizontal="center")
        
    # 3. Data Entry
    data = [
        ["PROD-A01", 120, 2400],
        ["PROD-B02", 85,  1700],
        ["PROD-C03", 210, 4200]
    ]
    for row in data:
        ws.append(row)
        
    # 4. Enforce Dynamic Formulas & Formatting (Double bottom border for totals)
    ws.append([]) # Spacing
    total_row = 8
    ws.cell(row=total_row, column=1, value="Total")
    ws.cell(row=total_row, column=2, value="=SUM(B4:B6)")
    ws.cell(row=total_row, column=3, value="=SUM(C4:C6)")
    
    double_border = Border(bottom=Side(style='double'), top=Side(style='thin'))
    for col in range(1, 4):
        cell = ws.cell(row=total_row, column=col)
        cell.font = Font(name="Arial", size=11, bold=True)
        cell.border = double_border
        
    # 5. Column Autoscaling (Avoid truncated cell text)
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col.column)
        for cell in col:
            if cell.value:
                max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)
        
    wb.save(filename)
    print(f"[SUCCESS] Workbook saved: {filename}")

create_formatted_report("output-report.xlsx")
```

### Step 3: Run the script to generate and verify file integrity
```bash
python3 scripts/build_report.py
file output-report.xlsx
```
Output:
```
[SUCCESS] Workbook saved: output-report.xlsx
output-report.xlsx: Microsoft Excel 2007+ XML
```

### Step 4: Write specifications and synchronize to the Shared Obsidian Vault [5, 6]
```bash
# Save specification conforming to standard lowercase kebab-case naming guidelines
cat << 'EOF' > docs/01-product/xlsx-reporting-spec.md
# Feature: Automated Formatted Excel Generator

## 1. Executive Summary
Provide a production-grade automated spreadsheet compilation pipeline utilizing openpyxl with column width autoscaling.

## 2. Technical Profile
- Language Target: Python 3.12
- Sheet Styling: Standard corporate blue colors (#1F4E78, #2F5597), Arial typeface
- Calculations: Dynamic SUM formulas (no static outputs)
EOF

./scripts/sync-obsidian.sh
```
Output:
```
[SUCCESS] Verified naming convention compliance for xlsx-reporting-spec.md.
[SUCCESS] Symlinked docs/01-product/xlsx-reporting-spec.md to /workspace/shared-obsidian-vault/forgewright/01-product/xlsx-reporting-spec.md.
```
