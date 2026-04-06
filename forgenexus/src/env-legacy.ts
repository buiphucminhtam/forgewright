/**
 * Map deprecated GITNEXUS_* env vars to FORGENEXUS_* (wiki / LLM docs) with a one-time warning.
 */

const LEGACY_LLM_PAIRS: [string, string][] = [
  ['GITNEXUS_LLM_PROVIDER', 'FORGENEXUS_LLM_PROVIDER'],
  ['GITNEXUS_LLM_BASE_URL', 'FORGENEXUS_LLM_BASE_URL'],
  ['GITNEXUS_LLM_API_KEY', 'FORGENEXUS_LLM_API_KEY'],
  ['GITNEXUS_LLM_MODEL', 'FORGENEXUS_LLM_MODEL'],
]

let legacyEnvWarned = false

export function applyLegacyGitnexusEnv(): void {
  for (const [from, to] of LEGACY_LLM_PAIRS) {
    const v = process.env[from]
    if (v !== undefined && v !== '' && (process.env[to] === undefined || process.env[to] === '')) {
      process.env[to] = v
      if (!legacyEnvWarned) {
        console.error(
          '[ForgeNexus] Deprecated env vars GITNEXUS_LLM_* were renamed to FORGENEXUS_LLM_*. ' +
            'Update your shell profile or CI secrets.',
        )
        legacyEnvWarned = true
      }
    }
  }
}
