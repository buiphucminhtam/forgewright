#!/usr/bin/env node
/**
 * Deprecated entry: the `gitnexus` bin name. Users must migrate to `forgenexus`.
 *
 * Escape hatch (temporary): FORGENEXUS_COMPAT_GITNEXUS_CLI=1
 */

const args = process.argv.slice(2)

if (process.env.FORGENEXUS_COMPAT_GITNEXUS_CLI !== '1') {
  const rest = args.length ? ` ${args.join(' ')}` : ''
  console.error(
    '[ForgeNexus] The `gitnexus` command was renamed to `forgenexus`.\n' +
      `  Use: forgenexus${rest}\n` +
      '  Temporary bridge (remove soon): FORGENEXUS_COMPAT_GITNEXUS_CLI=1 gitnexus ...',
  )
  process.exit(1)
}

console.error(
  '[ForgeNexus] WARNING: `gitnexus` is deprecated. Switch to `forgenexus`; ' +
    'FORGENEXUS_COMPAT_GITNEXUS_CLI will be removed in a future major release.',
)

const { main } = await import('./index.js').catch((err: unknown) => {
  console.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
});
main();
