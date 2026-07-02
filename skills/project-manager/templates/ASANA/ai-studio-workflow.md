# Asana AI Studio Workflow Template

> 专为 Asana AI Studio 功能设计的自动化工作流模板，包含 AI 驱动的任务处理配置。

---

## AI Studio Overview

### What is Asana AI Studio?
> Asana 的 AI 驱动的自动化平台，可以创建智能工作流来处理任务、分析内容并生成响应。

### Configuration URL
```
https://app.asana.com/0/[workspace]/ai-studio
```

---

## Workflow Structure

### Basic Workflow Template
```markdown
## Workflow: [Workflow Name]

**Trigger Type:** [Event/Schedule/Form]
**AI Model:** [GPT-4 / Claude / Let AI Decide]
**Status:** [Active/Draft/Paused]

### Workflow Summary
[One-sentence description of what this workflow does]

### Trigger Configuration
- **Type:** [What starts this workflow]
- **Source:** [Which project/list]
- **Filter:** [Any conditions]
```

---

## AI Action Types

### Action 1: AI Transform
```yaml
action:
  type: ai_transform
  name: "[Action Name]"
  
  prompt: |
    Analyze this task and:
    1. [Action 1]
    2. [Action 2]
    3. [Action 3]
  
  model: "Let AI Decide"
  temperature: 0.3              # Lower = more predictable
  max_tokens: 500

  output:
    - type: custom_field
      field: "Priority Score"
      value: "{ai_result.score}"
    
    - type: custom_field
      field: "Category"
      value: "{ai_result.category}"
    
    - type: tag
      value: "{ai_result.recommended_tags}"
```

### Action 2: AI Classify
```yaml
action:
  type: ai_classify
  name: "[Classification Action]"
  
  categories:
    - name: "Bug"
      description: "Technical issues and errors"
      color: "#ef4444"
      
    - name: "Feature Request"
      description: "New functionality requests"
      color: "#22c55e"
      
    - name: "Documentation"
      description: "Docs and content work"
      color: "#3b82f6"
      
    - name: "Tech Debt"
      description: "Code improvements"
      color: "#f59e0b"
  
  default_category: "Unclassified"
  confidence_threshold: 0.7
  
  output:
    - type: tag
      value: "{category_name}"
    - type: custom_field
      field: "Category"
      value: "{category_name}"
    - type: custom_field
      field: "Confidence"
      value: "{confidence_score}"
```

### Action 3: AI Route
```yaml
action:
  type: ai_route
  name: "[Routing Action]"
  
  routing_rules:
    - condition: "severity = Critical"
      action:
        assign_to: "@senior-dev"
        add_tag: "critical"
        set_due_date: "+1d"
        
    - condition: "severity = High"
      action:
        assign_to: "@on-call"
        add_tag: "high-priority"
        
    - condition: "type = Bug"
      action:
        assign_to: "@qa-lead"
        add_tag: "bug"
        
    - condition: "type = Feature Request"
      action:
        move_to_project: "Feature Requests"
        add_tag: "feature"
```

---

## Workflow Templates

### Template 1: Bug Triage Workflow
```yaml
workflow:
  name: "Bug Triage AI Workflow"
  trigger:
    type: task_added
    project: "[Support Team]"
    filter: "tags contains bug"
  status: active

ai_model: "GPT-4"

steps:
  1_analyze:
    prompt: |
      Analyze this bug report and extract:
      1. Severity (Critical/High/Medium/Low)
      2. Affected component
      3. Root cause category
      4. Recommended assignee based on component
      
      Return JSON with: severity, component, category, suggested_assignee

    output:
      - set_severity: "{severity}"
      - set_custom_field: "Component", "{component}"
      - set_custom_field: "Category", "{category}"
      - assign: "{suggested_assignee}"

  2_classify:
    type: ai_classify
    categories:
      - UI Bug
      - API Bug
      - Database Bug
      - Security Bug
      - Performance Bug

    output:
      - add_tag: "{category}"

  3_notify:
    type: send_notification
    if:
      severity: Critical
    channel: "#critical-bugs"
    message: "🚨 Critical bug reported: {task.name}"

  4_create_subtasks:
    type: create_subtasks
    if:
      severity: Critical
    tasks:
      - "Root cause analysis"
      - "Implement fix"
      - "Write regression test"
      - "QA verification"
```

### Template 2: Feature Request Workflow
```yaml
workflow:
  name: "Feature Request Handler"
  trigger:
    type: form_submitted
    form: "Feature Request Form"
  status: active

steps:
  1_score:
    type: ai_transform
    prompt: |
      Evaluate this feature request:
      1. User impact (1-10)
      2. Technical complexity (1-10)
      3. Business value (1-10)
      4. Priority score (weighted average)
      
      Return JSON with all scores and recommended_priority

  2_categorize:
    type: ai_classify
    categories:
      - Core Product
      - Integration
      - UI/UX
      - Performance
      - Mobile

  3_route:
    type: ai_route
    routing_rules:
      - condition: "category = Core Product"
        action:
          move_to_project: "Product Development"
          assign_to: "@product-lead"

      - condition: "category = Integration"
        action:
          move_to_project: "Integrations"
          assign_to: "@integration-team"

      - condition: "category = Mobile"
        action:
          move_to_project: "Mobile Team"
          assign_to: "@mobile-lead"

  4_follow_up:
    type: add_comment
    text: |
      📋 Feature Request Analysis Complete
      
      **Priority Score:** {score}/10
      **Category:** {category}
      **Complexity:** {complexity}/10
      
      Your request has been routed to the appropriate team.
      Expected response within [SLA] business days.
```

### Template 3: OKR Check-in Workflow
```yaml
workflow:
  name: "Weekly OKR Check-in"
  trigger:
    type: scheduled
    schedule: "Every Monday 9:00 AM"
  status: active

steps:
  1_generate_checklist:
    type: ai_transform
    prompt: |
      Look at all OKRs assigned to the current user.
      Generate a check-in response with:
      1. List of active OKRs
      2. Current progress for each
      3. Key tasks completed this week
      4. Any blockers
      
      Format as a structured response.

  2_create_check_in_task:
    type: create_task
    title: "OKR Check-in - Week {week_number}"
    assignee: "{user}"
    due_date: "+2d"
    notes: "{ai_generated_checklist}"

  3_send_reminder:
    type: send_notification
    channel: "#{user}-personal"
    message: |
      📊 Time for your weekly OKR check-in!
      
      Review your OKR progress and update your status.
      Task created: [Link]
```

---

## AI Teammate Configuration

### Teammate Definition
```yaml
ai_teammate:
  name: "[Teammate Name]"
  role: "[Function]"
  description: "[What they do]"
  
  personality:
    tone: "professional"      # professional, friendly, direct
    verbose: false            # detailed responses vs. concise
    
  capabilities:
    - name: "Brainstorm"
      description: "Generate ideas and alternatives"
      
    - name: "Review"
      description: "Review content and provide feedback"
      
    - name: "Summarize"
      description: "Create concise summaries"
      
    - name: "Flag Risks"
      description: "Identify potential risks"
```

### Teammate Memory
```yaml
memory:
  - category: "Team Processes"
    facts:
      - "Sprint planning happens every Monday"
      - "PRs require 2 approvals"
      - "Critical bugs need immediate escalation"
      
  - category: "Priority Guidelines"
    facts:
      - "P0 = Customer blocking, revenue impact"
      - "P1 = Feature blocked, no workaround"
      - "P2 = Feature impacted, workaround exists"
```

---

## Automation Rules

### Rule 1: Auto-Priority
```yaml
rule:
  name: "AI Priority Assignment"
  trigger:
    type: task_created
  
  conditions:
    - type: project
      value: "[Project Name]"
      
  actions:
    - type: ai_transform
      prompt: |
        Analyze this task and assign priority:
        - P0: Production down, customer impact
        - P1: Feature blocked, no workaround
        - P2: Feature impacted, workaround exists
        - P3: Nice to have
        
        Return only the priority level.
      output:
        set_priority: "{ai_result}"
```

### Rule 2: Smart Assignment
```yaml
rule:
  name: "AI-Based Assignment"
  trigger:
    type: task_created
    
  conditions:
    - type: tag
      value: "needs-assignment"
      
  actions:
    - type: ai_transform
      prompt: |
        Analyze this task and determine best assignee:
        1. Identify required skills
        2. Check team member skills and workload
        3. Match task to best-fit person
        
        Return JSON with: assignee_email, reasoning, confidence
      output:
        assign: "{assignee_email}"
        add_comment: "AI assigned to {assignee_email} because: {reasoning}"
```

### Rule 3: Auto-Close Resolved
```yaml
rule:
  name: "Auto-Close Resolved Tasks"
  trigger:
    type: scheduled
    schedule: "Daily at 18:00"
    
  conditions:
    - type: status
      value: "Complete"
    - type: custom_field
      field: "Days in Complete"
      operator: "greater_than"
      value: 3
      
  actions:
    - type: update_task
      status: "Closed"
    - type: add_tag
      value: "auto-closed"
```

---

## Example: Customer Support Workflow

### Complete Configuration
```yaml
workflow:
  name: "Customer Support Ticket Handler"
  trigger:
    type: task_added
    project: "Customer Support"
  status: active

ai_model: "GPT-4"

steps:
  1_analyze_ticket:
    prompt: |
      Analyze this support ticket:
      1. Issue category (Bug/Feature/Docs/Question)
      2. Urgency (Critical/High/Medium/Low)
      3. Affected customer tier (Enterprise/Premium/Standard)
      4. Recommended action
      
      Return JSON output.

  2_set_fields:
    output:
      - set_custom_field: "Issue Category", "{category}"
      - set_custom_field: "Urgency", "{urgency}"
      - set_custom_field: "Customer Tier", "{tier}"
      - add_tag: "{category}"
      - add_tag: "{tier}"

  3_assign:
    type: ai_route
    routing_rules:
      - condition: "urgency = Critical AND tier = Enterprise"
        action:
          assign_to: "@senior-support"
          notify_channel: "#enterprise-support"
          due_date: "+4h"
          
      - condition: "urgency = Critical"
        action:
          assign_to: "@on-call"
          due_date: "+24h"
          
      - condition: "category = Bug"
        action:
          assign_to: "@bug-team"
          move_to_project: "Bug Triage"

  4_respond:
    type: add_comment
    text: |
      🤖 AI Analysis Complete
      
      **Category:** {category}
      **Urgency:** {urgency}
      **Tier:** {tier}
      **Recommended Action:** {action}
      
      Assigned to: {assigned_to}
      Due: {due_date}
```

### Effectiveness Metrics
| Metric | Target | Actual |
|--------|--------|--------|
| Avg triage time | <5 min | 2 min |
| Assignment accuracy | >90% | 94% |
| SLA compliance | >95% | 97% |
| Customer CSAT | >4.5 | 4.7 |
