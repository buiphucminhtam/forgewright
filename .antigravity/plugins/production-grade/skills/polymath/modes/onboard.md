# Onboard Mode — Codebase Understanding

Load this mode when the user needs to understand an unfamiliar codebase, project, or system.

## Entry Behavior

Before presenting anything, do parallel reconnaissance:

```
Glob("**/*.{ts,js,py,go,rs,java}")    # Map language/files
Glob("**/package.json")                # Detect Node projects
Glob("**/go.mod")                      # Detect Go projects
Glob("**/requirements.txt")            # Detect Python projects
Glob("**/*.proto")                     # Detect gRPC
Glob("**/docker-compose*.yml")         # Detect containerization
Glob("**/*.yaml", path="api/")         # Detect API specs
Read("README.md")                      # Project description
Read("ANTIGRAVITY.md")                      # Project conventions
view_file_outline(<main entry files>)      # Architecture skeleton
```

Issue ALL of these in parallel. Then synthesize into a repo map.

## Progressive Disclosure

Present the codebase in layers — don't dump everything at once.

**Layer 1: Bird's Eye (always present first)**
```
This is a [language/framework] [architecture pattern] with [N] services/modules.
Tech stack: [language], [framework], [database], [cache], [message broker].
Size: ~[N]K lines, [N] files.
```

Then offer direction options:
```python
notify_user with markdown options:
  "question": "[bird's eye summary]",
  "header": "Codebase Overview",
  "options": [
    {"label": "Walk me through the main business flows (Recommended)", "description": "Trace how data moves through the system"},
    {"label": "Explain the data model", "description": "Database schema, relationships, key entities"},
    {"label": "Show me the API surface", "description": "Endpoints, contracts, authentication"},
    {"label": "Explain the architecture decisions", "description": "Why things are built this way"},
    {"label": "Chat about this", "description": "Free-form input"}
  ],
  "multiSelect": false
}])
```

**Layer 2: Domain Flows (on request)**
Trace a user action end-to-end: HTTP request -> handler -> service -> repository -> database. Use view_file_outline to show the call chain without reading every file.

**Layer 3: Deep Dive (on request)**
Read specific files the user wants to understand. Explain the code, the patterns, and the "why" behind implementation choices.

## Output

Write to `.forgewright/polymath/context/repo-map.md`:

```markdown
# Repo Map — [project name]
Generated: [date]

## Tech Stack
- Language: [X]
- Framework: [X]
- Database: [X]
- Cache: [X]
- Auth: [X]

## Architecture
- Pattern: [monolith/microservices/modular monolith]
- Services: [list with brief descriptions]
- Key modules: [list]

## Data Model
- Primary entities: [list]
- Key relationships: [describe]

## API Surface
- [N] endpoints across [N] domains
- Auth model: [JWT/session/API key]

## Business Domains
- [Domain 1]: [brief description, key files]
- [Domain 2]: [brief description, key files]

## Conventions
- [Naming patterns, folder structure, testing approach]

## Notable Patterns
- [Interesting architectural choices, trade-offs observed]
```

This persists across sessions — future polymath activations read this instead of re-scanning the codebase.

## Common Onboarding Questions (Anticipate These as Options)

- "Where does [business logic] live?"
- "How does authentication work?"
- "What happens when [user action]?"
- "Where are the tests?"
- "How do I run this locally?"
- "What's the deployment process?"
- "Where should I add [new feature]?"
