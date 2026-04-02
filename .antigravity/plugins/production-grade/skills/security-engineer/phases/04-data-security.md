# Phase 4: Data Security

## Objective

Inventory every piece of sensitive data in the system, verify encryption at rest and in transit, and validate regulatory compliance posture. security-engineer is the SOLE AUTHORITY on PII inventory, data classification, and GDPR/CCPA compliance assessment at the application layer. No other skill performs PII audits or compliance mapping. Generate all outputs in `.forgewright/security-engineer/data-security/`.

## Context Bridge

Read Phase 3 outputs from `.forgewright/security-engineer/auth-review/`. Token management findings feed directly into data security -- tokens are sensitive data. Also reference Phase 2 code audit findings for A02 (Cryptographic Failures) as the starting point for encryption analysis.

## Inputs

- Phase 2 code audit -- `.forgewright/security-engineer/code-audit/` (A02 findings)
- Phase 3 auth review -- `.forgewright/security-engineer/auth-review/`
- Data schemas -- `schemas/` (ERD, migrations, data models)
- Implementation code -- data access layers, ORM models, API response serializers
- Infrastructure configs -- database encryption settings, backup configs
- Architecture docs -- data flow diagrams, storage architecture

## Workflow

### Step 1: Build PII Inventory

Catalog EVERY PII and sensitive data field across ALL storage and transit locations. PII is not limited to database columns -- check all of the following:

- **Database columns** -- every table and column containing personal data
- **Cache stores** -- Redis, Memcached, in-memory caches holding user data
- **Message queues** -- Kafka topics, RabbitMQ queues, SQS messages containing PII
- **Log files** -- application logs, access logs, error tracking (Sentry, Datadog)
- **Browser storage** -- localStorage, sessionStorage, cookies containing user data
- **File storage** -- S3 buckets, local file uploads, temp directories
- **API responses** -- fields returned to clients that contain PII
- **Third-party services** -- analytics, error tracking, email providers receiving PII

For each PII field, document:

| Column | Description |
|--------|-------------|
| Data Field | Name of the field (e.g., email, phone, SSN) |
| Service | Which service owns this data |
| Storage | Where it is stored (DB, cache, logs, etc.) |
| Classification | Public / Internal / Confidential / Restricted |
| Encrypted at Rest | Yes/No, algorithm used |
| Encrypted in Transit | Yes/No, TLS version |
| Logged | Is this field appearing in logs? (should be No for PII) |
| In API Responses | Is it returned unnecessarily? |
| Retention | How long is it kept? |
| Legal Basis | Why the system collects it (contractual, consent, legitimate interest) |

### Step 2: Audit Encryption Implementation

Review all encryption in the system:

**At rest:**
- Database encryption (TDE, column-level, application-level)
- File storage encryption (S3 SSE, disk encryption)
- Backup encryption (algorithm, key management)
- Cache encryption (Redis TLS, encrypted at rest)

**In transit:**
- TLS version and cipher suites (reject TLS 1.0/1.1, weak ciphers)
- Internal service communication encryption (mTLS, service mesh TLS)
- Certificate management and expiration monitoring

**Application-level:**
- Field-level encryption for highly sensitive data (SSN, credit card)
- Key derivation functions for passwords
- Encryption library versions (reject outdated libraries)

**Flag violations:**
- Deprecated algorithms: DES, 3DES, RC4, MD5 for integrity, SHA1 for signing
- ECB mode usage (use CBC/GCM instead)
- Hardcoded encryption keys or initialization vectors
- Missing HMAC on encrypted data (require encrypt-then-MAC)
- Custom cryptography implementations (must use vetted libraries)
- Keys stored alongside encrypted data

### Step 3: Validate Key Management

Document the complete key management lifecycle:

- Where are encryption keys stored? (HSM, KMS, secrets manager, environment variable, config file, hardcoded)
- Who has access to keys? (service accounts, developers, CI/CD)
- How are keys rotated? (automated schedule, manual, never)
- Is there a key hierarchy? (master key -> data encryption keys)
- What happens if a key is compromised? (re-encryption procedure)
- Are old keys retained for decrypting historical data?

### Step 4: Audit Data Retention

Document and validate data lifecycle:

- **Active data** -- retention period in primary storage
- **Archived data** -- archive location, access controls, encryption
- **Deleted data** -- soft delete vs hard delete, purge timeline
- **Logs** -- retention periods by type (access, application, security, audit)
- **Backups** -- retention, encryption, geographic location
- **Third-party data** -- what is shared with third parties, their retention policies

Verify enforcement:
- Are automated purge jobs implemented?
- Are purge jobs tested and monitored?
- Do purge jobs handle cascading deletes correctly?
- Are audit logs exempted from purge (required for compliance)?

### Step 5: Map GDPR/CCPA Compliance

Map regulatory requirements to implementation status. For each requirement, assess: Compliant, Partial, Non-Compliant, or Not Applicable.

**GDPR requirements:**

| Requirement | GDPR Article | Status | Implementation | Gap |
|------------|-------------|--------|----------------|-----|
| Lawful basis for processing | Art. 6 | | | |
| Consent management | Art. 7 | | | |
| Right to access (data export) | Art. 15 | | | |
| Right to rectification | Art. 16 | | | |
| Right to erasure | Art. 17 | | | |
| Right to data portability | Art. 20 | | | |
| Data breach notification | Art. 33-34 | | | |
| Data Protection Impact Assessment | Art. 35 | | | |
| Privacy by design | Art. 25 | | | |
| Data Processing Agreements | Art. 28 | | | |
| Cross-border transfers | Art. 44-49 | | | |
| DPO appointment | Art. 37-39 | | | |

**CCPA additional requirements:**
- Do Not Sell My Personal Information mechanism
- Financial incentive disclosures for data collection
- 12-month lookback for data collection categories
- Household-level data access requests

### Step 6: Verify Secrets Management

Audit how the codebase handles secrets:

- Search for hardcoded secrets (API keys, passwords, tokens in source code)
- Verify `.env` files are in `.gitignore`
- Check git history for accidentally committed secrets
- Review secrets manager integration (Vault, AWS Secrets Manager, etc.)
- Verify secret rotation automation
- Check CI/CD pipeline for exposed secrets in logs or artifacts

## Output Deliverables

Write all outputs to `.forgewright/security-engineer/data-security/`:

| File | Contents |
|------|----------|
| `pii-inventory.md` | Complete catalog of every PII field across all storage locations |
| `encryption-audit.md` | Encryption review for at-rest, in-transit, and application-level |
| `data-retention-policy.md` | Retention analysis with enforcement verification |
| `gdpr-compliance.md` | GDPR/CCPA requirement-to-implementation mapping |

## Validation

Before proceeding to Phase 5, verify:
- [ ] PII inventory covers ALL storage locations (not just database columns)
- [ ] Every encryption implementation has been reviewed (not just "TLS is enabled")
- [ ] Key management lifecycle is fully documented
- [ ] GDPR/CCPA compliance status is assessed per requirement
- [ ] Secrets management audit found no hardcoded credentials

## Quality Bar

A data security audit that only checks database columns for PII is incomplete. PII leaks into logs, caches, error tracking services, analytics pipelines, browser localStorage, and third-party integrations. The audit must trace data through EVERY layer. Similarly, "encryption is enabled" is not an assessment -- specify the algorithm, key length, mode of operation, and whether the implementation follows current best practices.
