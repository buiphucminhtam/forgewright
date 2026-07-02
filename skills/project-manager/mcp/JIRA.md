# Jira Rovo Dev CLI 集成指南

> Jira Rovo Dev — Atlassian 企业级开发工具，支持从 Issue 自动生成代码、PR 审查和自动化工作流。

## 目录

- [安装配置](#安装配置)
- [核心命令](#核心命令)
- [代码生成](#代码生成)
- [PR 审查](#pr-审查)
- [自动化脚本](#自动化脚本)
- [错误处理](#错误处理)
- [降级策略](#降级策略)

---

## 安装配置

### 系统要求

| 要求 | 最低版本 |
|------|----------|
| Node.js | 18.0+ |
| npm | 9.0+ |
| Atlassian 账户 | 需要 |

### 安装步骤

```bash
# 全局安装 Rovo Dev CLI
npm install -g @atlassian/rovo-dev

# 验证安装
rovo --version
# 输出: @atlassian/rovo-dev/1.2.3
```

### 认证配置

```bash
# 交互式登录
rovo login

# 指定 Atlassian 站点
rovo login --site your-company.atlassian.net

# 查看当前登录状态
rovo auth status

# 退出登录
rovo logout
```

### MCP 配置 (可选)

```json
// cursor-mcp.json
{
  "mcpServers": {
    "jira-rovo": {
      "command": "npx",
      "args": ["-y", "@atlassian/rovo-dev-mcp"]
    }
  }
}
```

### 环境变量

```bash
# Rovo Dev 配置
export ROVO_SITE="your-company.atlassian.net"
export ROVO_DEFAULT_PROJECT="PROJ"
export ROVO_BRANCH_PREFIX="feature"

# AI 模型配置 (可选)
export ROVO_MODEL="claude-3-5-sonnet"
export ROVO_MAX_TOKENS=8192
```

---

## 核心命令

### Issue 操作

```bash
# 查看 Issue 详情
rovo issue view PROJ-123

# 列出项目所有 Issue
rovo issue list --project PROJ --status "In Progress"

# 搜索 Issue
rovo issue search --query "type:bug assignee:@me"

# 创建 Issue
rovo issue create \
  --project PROJ \
  --title "修复登录页面崩溃" \
  --type bug \
  --priority high \
  --description "当用户输入超长密码时页面崩溃"

# 更新 Issue 状态
rovo issue transition PROJ-123 --status "In Review"

# 分配 Issue
rovo issue assign PROJ-123 --assignee username
```

### 子任务操作

```bash
# 从父 Issue 创建子任务
rovo issue subtask \
  --issue PROJ-123 \
  --count 5 \
  --template "implementation"

# 拆分大型 Issue
rovo issue split PROJ-456 --parts 3

# 链接相关 Issue
rojo issue link PROJ-123 --blocks PROJ-456
```

### 冲刺管理

```bash
# 创建冲刺
rovo sprint create \
  --project PROJ \
  --name "Sprint 24" \
  --duration "2 weeks" \
  --start "2024-01-15"

# 查看当前冲刺
rovo sprint current --project PROJ

# 添加 Issue 到冲刺
rovo sprint add PROJ-123 --sprint "Sprint 24"

# 完成冲刺
rovo sprint complete --sprint "Sprint 24"
```

---

## 代码生成

### 从 Issue 生成代码

```bash
# 基础代码生成
rovo issue develop \
  --issue PROJ-123 \
  --branch feature/proj-123-auth

# 指定模板
rovo issue develop \
  --issue PROJ-123 \
  --branch feature/user-auth \
  --template "auth-service"

# 自定义模板
rovo issue develop \
  --issue PROJ-123 \
  --template ./custom-templates/api-endpoint.ts

# 预览生成结果
rovo issue develop \
  --issue PROJ-123 \
  --dry-run

# 仅生成测试
rovo issue develop \
  --issue PROJ-123 \
  --test-only
```

### 命令行参数详解

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--issue` | Jira Issue Key | 必需 |
| `--branch` | Git 分支名 | `feature/{issue-key}` |
| `--template` | 代码模板 | `default` |
| `--dry-run` | 预览模式 | `false` |
| `--test-only` | 仅生成测试 | `false` |
| `--model` | AI 模型 | `claude-3-5-sonnet` |

### 代码模板

```bash
# 列出可用模板
rovo template list

# 创建自定义模板
rovo template create \
  --name "react-component" \
  --path ./templates/react-component.tsx

# 模板变量
# {{issue_key}} - Issue Key
# {{title}} - Issue 标题
# {{description}} - Issue 描述
# {{assignee}} - 分配人
# {{priority}} - 优先级
```

### 生成最佳实践

```bash
# 1. 先审查生成的代码
rovo issue develop --issue PROJ-123 --dry-run

# 2. 先生成测试用例
rovo issue develop --issue PROJ-123 --test-only

# 3. 再生成实现代码
rovo issue develop --issue PROJ-123

# 4. 单独审查 PR
rovo pr review --pr 123
```

---

## PR 审查

### 审查命令

```bash
# 基础 PR 审查
rovo pr review --pr 123

# 使用验收标准文件
rovo pr review \
  --pr 123 \
  --criteria acceptance.md

# 指定审查重点
rovo pr review \
  --pr 123 \
  --focus "security,performance"

# 详细审查报告
rovo pr review \
  --pr 123 \
  --format json \
  --output review-report.json
```

### 验收标准审查

```bash
# 创建验收标准模板
cat > acceptance.md << 'EOF'
## 功能验收标准

### 前提条件
- [ ] 用户已登录
- [ ] 用户有管理员权限

### 验收场景

### 场景 1: 创建新用户
- **Given** 管理后台打开
- **When** 点击"添加用户"
- **Then** 显示用户表单
- **And** 可以填写姓名、邮箱、角色

### 场景 2: 表单验证
- **Given** 用户表单打开
- **When** 邮箱格式错误
- **Then** 显示"邮箱格式无效"
- **And** 阻止提交

### 性能要求
- 页面加载时间 < 2秒
- 表单提交响应 < 500ms
EOF

# 审查 PR 是否满足验收标准
rovo pr review --pr 123 --criteria acceptance.md
```

### 自动审查检查项

```bash
# 运行完整检查
rovo pr check --pr 123

# 检查项包括:
# - 代码质量
# - 安全漏洞
# - 性能影响
# - 测试覆盖率
# - 文档完整性
# - 验收标准符合度
```

---

## 自动化脚本

### TypeScript 脚本

```typescript
// sprint-automation.ts
import { Rovo } from '@atlassian/rovo-dev';

const rovo = new Rovo();

async function createSprintTasks() {
  // 1. 获取当前冲刺
  const sprint = await rovo.sprint.current({ project: 'PROJ' });
  
  // 2. 从 Epic 获取子任务
  const epic = await rovo.issue.get('PROJ-100');
  const stories = await rovo.issue.children({ id: epic.id });
  
  // 3. 创建冲刺任务
  for (const story of stories) {
    await rovo.sprint.addTask({
      sprintId: sprint.id,
      issueId: story.id
    });
  }
  
  // 4. 平衡工作量
  await rovo.sprint.balanceWorkload({ sprintId: sprint.id });
  
  // 5. 生成冲刺报告
  const report = await rovo.sprint.generateReport({ sprintId: sprint.id });
  console.log('Sprint Report:', report);
}

createSprintTasks();
```

### 运行脚本

```bash
# 运行自动化脚本
rovo script run --file sprint-automation.ts

# 计划定时任务
rovo schedule run \
  --script daily-standup.ts \
  --cron "0 9 * * 1-5"  # 每天早上9点 (工作日)

# 列出所有计划任务
rovo schedule list
```

### 常用自动化脚本

#### 每日站会摘要

```typescript
// daily-standup.ts
import { Rovo } from '@atlassian/rovo-dev';

const rovo = new Rovo();

async function generateStandup() {
  const updates = await rovo.issue.getUpdates({
    since: 'yesterday',
    team: 'engineering'
  });
  
  const summary = {
    completed: updates.filter(u => u.status === 'done'),
    inProgress: updates.filter(u => u.status === 'in_progress'),
    blockers: updates.filter(u => u.blocker)
  };
  
  await rovo.notification.send({
    channel: '#standups',
    message: formatStandup(summary)
  });
}
```

#### 冲刺健康检查

```typescript
// sprint-health.ts
import { Rovo } from '@atlassian/rovo-dev';

const rovo = new Rovo();

async function checkSprintHealth() {
  const sprint = await rovo.sprint.current({ project: 'PROJ' });
  const metrics = await rovo.sprint.metrics({ sprintId: sprint.id });
  
  // 检查风险指标
  const risks = [];
  
  if (metrics.completionRate < 0.5) {
    risks.push('Sprint 进度落后');
  }
  
  if (metrics.blockers.length > 3) {
    risks.push(`存在 ${metrics.blockers.length} 个阻塞项`);
  }
  
  if (metrics.scopeChange > 20) {
    risks.push('Sprint 范围变更过大');
  }
  
  if (risks.length > 0) {
    await rovo.notification.send({
      channel: '#sprint-alerts',
      priority: 'high',
      message: `⚠️ Sprint 健康预警:\n${risks.join('\n')}`
    });
  }
}
```

---

## 错误处理

### 认证过期

```bash
# 检测认证状态
rovo auth status
# 输出: Token expired. Please run 'rovo login'

# 重新登录
rovo login --force

# 如果是多站点环境
rovo login --site new-site.atlassian.net
```

### 网络错误

```bash
# 超时配置
rovo config set timeout 30000

# 代理配置
export HTTPS_PROXY=http://proxy.company.com:8080
rovo issue view PROJ-123
```

### 权限不足

```bash
# 检查当前用户权限
rovo auth permissions

# 常见权限问题
# 需要: "Edit issues" - 创建和编辑 Issue
# 需要: "Create branches" - 从 Issue 创建分支
# 需要: "Browse projects" - 访问项目
```

### AI 服务错误

```bash
# 模型不可用时降级
rovo config set model claude-3-haiku

# 禁用 AI 功能
rovo config set ai.disabled true

# 查看详细错误
rovo --verbose issue develop --issue PROJ-123
```

---

## 降级策略

当 Rovo CLI 不可用时，按以下顺序降级：

### 1. Jira REST API

```bash
# 使用 curl 直接调用
curl -X GET "https://your-company.atlassian.net/rest/api/3/issue/PROJ-123" \
  -H "Authorization: Basic $(echo -n email:token | base64)" \
  -H "Content-Type: application/json"
```

### 2. Jira CLI (无 AI 功能)

```bash
# 使用 atlassian-cli
npx @forgewright/jira-cli issue view PROJ-123
```

### 3. 手动 Jira UI

```bash
# 直接打开 Issue
open "https://your-company.atlassian.net/browse/PROJ-123"
```

### 4. Linear 作为备份

参见 [LINEAR.md](./LINEAR.md) 使用 Linear 作为临时项目管理工具。

---

## 配置参考

### 全局配置

```bash
# 查看所有配置
rovo config list

# 设置默认值
rovo config set default.project PROJ
rovo config set default.template typescript
rovo config set branch.prefix feature

# 配置文件位置
# macOS: ~/.rovo/config.json
# Linux: ~/.rovo/config.json
# Windows: %USERPROFILE%\.rovo\config.json
```

### 项目级配置

```yaml
# .rovo.yml
project: PROJ
site: your-company.atlassian.net
templates:
  issue: ./templates/issue
  pr: ./templates/pr
ai:
  model: claude-3-5-sonnet
  temperature: 0.3
```

---

## 官方文档

- Rovo Dev 官方文档: https://developer.atlassian.com/tutorials/rovo-dev/
- CLI 参考: https://developer.atlassian.com/reference/rovo/cli
- API 文档: https://developer.atlassian.com/reference/rovo/api
- 模板开发: https://developer.atlassian.com/tutorials/rovo-dev/templates
