# Mode Classification Test Cases
# Tests for 24 execution modes detection

## Full Build Mode

```yaml
test_id: mode-001
input: "build a SaaS for pet adoption"
expected:
  mode: "Full Build"
  confidence: 0.95
  triggers: ["build", "SaaS"]
---
test_id: mode-002
input: "build a full stack app from scratch"
expected:
  mode: "Full Build"
  confidence: 0.90
  triggers: ["build", "full stack", "scratch"]
---
test_id: mode-003
input: "create a new web application"
expected:
  mode: "Full Build"
  confidence: 0.85
  triggers: ["create", "new", "application"]
```

## Feature Mode

```yaml
test_id: mode-004
input: "add login functionality"
expected:
  mode: "Feature"
  confidence: 0.90
  triggers: ["add"]
---
test_id: mode-005
input: "implement user authentication"
expected:
  mode: "Feature"
  confidence: 0.90
  triggers: ["implement"]
---
test_id: mode-006
input: "new endpoint for user profile"
expected:
  mode: "Feature"
  confidence: 0.85
  triggers: ["new", "endpoint"]
```

## Review Mode

```yaml
test_id: mode-007
input: "review my code"
expected:
  mode: "Review"
  confidence: 0.95
  triggers: ["review"]
---
test_id: mode-008
input: "code quality check for auth module"
expected:
  mode: "Review"
  confidence: 0.85
  triggers: ["code", "quality"]
---
test_id: mode-009
input: "audit the security implementation"
expected:
  mode: "Review"
  confidence: 0.90
  triggers: ["audit"]
```

## Debug Mode

```yaml
test_id: mode-010
input: "fix the login bug"
expected:
  mode: "Debug"
  confidence: 0.95
  triggers: ["fix", "bug"]
---
test_id: mode-011
input: "crash when loading user data"
expected:
  mode: "Debug"
  confidence: 0.90
  triggers: ["crash"]
---
test_id: mode-012
input: "error in authentication flow"
expected:
  mode: "Debug"
  confidence: 0.90
  triggers: ["error"]
```

## Test Mode

```yaml
test_id: mode-013
input: "write tests for the API"
expected:
  mode: "Test"
  confidence: 0.95
  triggers: ["write", "tests"]
---
test_id: mode-014
input: "add test coverage for auth"
expected:
  mode: "Test"
  confidence: 0.90
  triggers: ["test", "coverage"]
---
test_id: mode-015
input: "run pytest on the backend"
expected:
  mode: "Test"
  confidence: 0.85
  triggers: ["test", "pytest"]
```

## Ship Mode

```yaml
test_id: mode-016
input: "deploy to production"
expected:
  mode: "Ship"
  confidence: 0.95
  triggers: ["deploy"]
---
test_id: mode-017
input: "set up CI/CD pipeline"
expected:
  mode: "Ship"
  confidence: 0.90
  triggers: ["CI", "CD", "pipeline"]
---
test_id: mode-018
input: "dockerize the application"
expected:
  mode: "Ship"
  confidence: 0.85
  triggers: ["docker", "dockerize"]
```

## Architect Mode

```yaml
test_id: mode-019
input: "design the system architecture"
expected:
  mode: "Architect"
  confidence: 0.95
  triggers: ["design", "architecture"]
---
test_id: mode-020
input: "API design for the microservices"
expected:
  mode: "Architect"
  confidence: 0.90
  triggers: ["design", "API"]
---
test_id: mode-021
input: "database schema design"
expected:
  mode: "Architect"
  confidence: 0.85
  triggers: ["design", "schema"]
```

## Game Build Mode

```yaml
test_id: mode-022
input: "build a game with Unity"
expected:
  mode: "Game Build"
  confidence: 0.95
  triggers: ["game", "Unity"]
---
test_id: mode-023
input: "create a Roblox experience"
expected:
  mode: "Game Build"
  confidence: 0.95
  triggers: ["Roblox"]
---
test_id: mode-024
input: "build FPS in Unreal Engine"
expected:
  mode: "Game Build"
  confidence: 0.95
  triggers: ["Unreal"]
```

## Mobile Mode

```yaml
test_id: mode-025
input: "build a mobile app for iOS"
expected:
  mode: "Mobile"
  confidence: 0.95
  triggers: ["mobile", "iOS"]
---
test_id: mode-026
input: "React Native app for Android"
expected:
  mode: "Mobile"
  confidence: 0.90
  triggers: ["React Native", "Android"]
---
test_id: mode-027
input: "mobile responsiveness fixes"
expected:
  mode: "Mobile"
  confidence: 0.85
  triggers: ["mobile"]
```

## XR Build Mode

```yaml
test_id: mode-028
input: "build a VR app for Quest"
expected:
  mode: "XR Build"
  confidence: 0.95
  triggers: ["VR", "Quest"]
---
test_id: mode-029
input: "AR experience for mobile"
expected:
  mode: "XR Build"
  confidence: 0.95
  triggers: ["AR"]
---
test_id: mode-030
input: "mixed reality application"
expected:
  mode: "XR Build"
  confidence: 0.90
  triggers: ["mixed reality", "MR"]
```

## Research Mode

```yaml
test_id: mode-031
input: "research best practices for authentication"
expected:
  mode: "Research"
  confidence: 0.95
  triggers: ["research"]
---
test_id: mode-032
input: "deep research on microservices patterns"
expected:
  mode: "Research"
  confidence: 0.90
  triggers: ["research", "deep"]
---
test_id: mode-033
input: "find sources on GraphQL"
expected:
  mode: "Research"
  confidence: 0.85
  triggers: ["find", "sources"]
```

## Optimize Mode

```yaml
test_id: mode-034
input: "optimize database queries"
expected:
  mode: "Optimize"
  confidence: 0.95
  triggers: ["optimize"]
---
test_id: mode-035
input: "performance improvement for API"
expected:
  mode: "Optimize"
  confidence: 0.90
  triggers: ["performance", "improvement"]
---
test_id: mode-036
input: "slow page load times"
expected:
  mode: "Optimize"
  confidence: 0.85
  triggers: ["slow"]
```

## Security Mode

```yaml
test_id: mode-037
input: "harden the API security"
expected:
  mode: "Harden"
  confidence: 0.95
  triggers: ["harden", "security"]
---
test_id: mode-038
input: "security audit for payment module"
expected:
  mode: "Harden"
  confidence: 0.90
  triggers: ["security", "audit"]
---
test_id: mode-039
input: "add authentication"
expected:
  mode: "Feature"
  confidence: 0.85
  triggers: ["add", "authentication"]
```

## Document Mode

```yaml
test_id: mode-040
input: "document the API endpoints"
expected:
  mode: "Document"
  confidence: 0.95
  triggers: ["document"]
---
test_id: mode-041
input: "write docs for the SDK"
expected:
  mode: "Document"
  confidence: 0.90
  triggers: ["write", "docs"]
---
test_id: mode-042
input: "update README"
expected:
  mode: "Document"
  confidence: 0.85
  triggers: ["README"]
```

## Explore Mode

```yaml
test_id: mode-043
input: "explain how the auth flow works"
expected:
  mode: "Explore"
  confidence: 0.95
  triggers: ["explain", "how"]
---
test_id: mode-044
input: "how does the caching work"
expected:
  mode: "Explore"
  confidence: 0.90
  triggers: ["how does"]
---
test_id: mode-045
input: "help me understand the codebase"
expected:
  mode: "Explore"
  confidence: 0.85
  triggers: ["understand"]
```

## AI Build Mode

```yaml
test_id: mode-046
input: "add AI chatbot to the app"
expected:
  mode: "AI Build"
  confidence: 0.95
  triggers: ["AI", "chatbot"]
---
test_id: mode-047
input: "implement RAG for documents"
expected:
  mode: "AI Build"
  confidence: 0.95
  triggers: ["RAG"]
---
test_id: mode-048
input: "add LLM integration"
expected:
  mode: "AI Build"
  confidence: 0.90
  triggers: ["LLM"]
```

## Marketing Mode

```yaml
test_id: mode-049
input: "marketing strategy for launch"
expected:
  mode: "Marketing"
  confidence: 0.95
  triggers: ["marketing"]
---
test_id: mode-050
input: "SEO optimization"
expected:
  mode: "Marketing"
  confidence: 0.90
  triggers: ["SEO"]
---
test_id: mode-051
input: "launch strategy"
expected:
  mode: "Marketing"
  confidence: 0.85
  triggers: ["launch", "strategy"]
```

## Grow Mode

```yaml
test_id: mode-052
input: "improve conversion rate"
expected:
  mode: "Grow"
  confidence: 0.95
  triggers: ["conversion"]
---
test_id: mode-053
input: "A/B testing for landing page"
expected:
  mode: "Grow"
  confidence: 0.90
  triggers: ["A/B", "testing"]
---
test_id: mode-054
input: "growth experiment for signup"
expected:
  mode: "Grow"
  confidence: 0.85
  triggers: ["growth"]
```

## Analyze Mode

```yaml
test_id: mode-055
input: "analyze requirements for the project"
expected:
  mode: "Analyze"
  confidence: 0.95
  triggers: ["analyze", "requirements"]
---
test_id: mode-056
input: "evaluate the technical options"
expected:
  mode: "Analyze"
  confidence: 0.90
  triggers: ["evaluate"]
---
test_id: mode-057
input: "feasibility study for the feature"
expected:
  mode: "Analyze"
  confidence: 0.85
  triggers: ["feasibility", "study"]
```

## Migrate Mode

```yaml
test_id: mode-058
input: "migrate from REST to GraphQL"
expected:
  mode: "Migrate"
  confidence: 0.95
  triggers: ["migrate"]
---
test_id: mode-059
input: "upgrade to React 19"
expected:
  mode: "Migrate"
  confidence: 0.90
  triggers: ["upgrade"]
---
test_id: mode-060
input: "database migration"
expected:
  mode: "Migrate"
  confidence: 0.85
  triggers: ["migration"]
```

## Prompt Mode

```yaml
test_id: mode-061
input: "improve the prompts for the chatbot"
expected:
  mode: "Prompt"
  confidence: 0.95
  triggers: ["improve", "prompts"]
---
test_id: mode-062
input: "prompt engineering for the AI"
expected:
  mode: "Prompt"
  confidence: 0.90
  triggers: ["prompt", "engineering"]
---
test_id: mode-063
input: "optimize LLM prompts"
expected:
  mode: "Prompt"
  confidence: 0.85
  triggers: ["optimize", "prompts"]
```
