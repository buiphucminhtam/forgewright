# Sensitive File Protection Protocol

> **Purpose:** Prevent accidental exposure of credentials, secrets, and sensitive data during AI-assisted development.

## NEVER Read Without Explicit User Approval

Files matching these patterns require **user confirmation** before reading:

### Credential Files
- `.env`, `.env.*`, `*.env`
- `.npmrc`, `.pypirc`, `.gem/credentials`
- `credentials.json`, `service-account*.json`
- `*.keystore`, `*.jks`

### Key Files
- `*.pem`, `*.p12`, `*.pfx`, `*.key`, `*.crt` (private keys)
- `id_rsa`, `id_ed25519`, `id_ecdsa` (SSH keys)
- `*.gpg`, `*.asc` (GPG keys)

### Secret Patterns (filename contains)
- `*secret*`, `*credential*`, `*password*`
- `*token*`, `*api_key*`, `*apikey*`
- `*private_key*`, `*auth*` (combined with key/token context)

### Platform-Specific
- `.docker/config.json` (Docker registry auth)
- `kubeconfig`, `kube/config` (K8s cluster creds)
- `.aws/credentials`, `.azure/credentials` (cloud provider creds)
- `gcloud/application_default_credentials.json`
- `firebase*.json` (may contain private keys)
- `.netrc`, `.htpasswd`

## NEVER Include in Output

When encountering sensitive values during any task, **redact immediately**:

| Type | Example | Redacted |
|------|---------|----------|
| API Key | `sk-proj-abc123xyz...` | `sk-proj-***REDACTED***` |
| Database URL | `postgres://user:pass@host/db` | `postgres://***:***@host/db` |
| JWT Secret | `JWT_SECRET=mySecret123` | `JWT_SECRET=***REDACTED***` |
| Private Key | `-----BEGIN RSA PRIVATE KEY-----` | `[PRIVATE KEY REDACTED]` |
| Access Token | `ghp_xxxxxxxxxxxx` | `ghp_***REDACTED***` |

**Rules:**
- If a file's contents include any pattern above, redact before including in any output, report, or artifact
- If a `.env.example` exists, reference that instead of the real `.env`
- When suggesting env var values, use placeholder format: `YOUR_API_KEY_HERE`

## NEVER Commit Secrets

Before suggesting a `git commit` or `git push`:

1. **Check `.gitignore`** — ensure sensitive patterns are listed
2. **Scan staged files** — if any match sensitive patterns, WARN the user
3. **Suggest `.gitignore` additions** if missing:

```gitignore
# Secrets & credentials
.env
.env.*
*.pem
*.key
*.p12
*.pfx
*.keystore
credentials.json
service-account*.json
```

## When User Explicitly Requests Access

If the user explicitly asks to read a sensitive file (e.g., "read my .env"):
1. Acknowledge it contains sensitive data
2. Read the file as requested
3. **Redact values in all subsequent output** — never echo secrets back
4. Use the values internally for the task, but mask in any reports/artifacts

## Integration

All skills that perform file operations MUST follow this protocol:
- **Software Engineer**, **Frontend Engineer**, **DevOps**, **SRE** — file read/write
- **Code Reviewer** — reviewing diffs that may contain secrets
- **Security Engineer** — audit may require reading secrets (apply redaction)
- **Database Engineer** — connection strings
- **Debugger** — log analysis may expose secrets

> Inspired by ClaudeKit's privacy-block pattern, adapted as instruction-based protocol for agent-agnostic portability.
