export function assertAuditPolicy(vulnerabilities) {
  if ((vulnerabilities.high ?? 0) > 0 || (vulnerabilities.critical ?? 0) > 0) {
    throw new Error(`production audit found high=${vulnerabilities.high ?? 0}, critical=${vulnerabilities.critical ?? 0}`);
  }
}

export function assertCoveragePolicy(totals, thresholds) {
  for (const [metric, minimum] of Object.entries(thresholds)) {
    if ((totals?.[metric]?.pct ?? 0) < minimum) {
      throw new Error(`coverage ${metric}=${totals?.[metric]?.pct ?? 0}% is below ${minimum}%`);
    }
  }
}

export function forbiddenMcpPaths(files) {
  return files
    .map((entry) => entry.path)
    .filter((path) => path.startsWith('.forgewright/') || path.startsWith('coverage/') || path.startsWith('src/') || path.endsWith('.test.js'));
}

export function assertRequiredPaths(report, paths) {
  for (const path of paths) {
    if (!report.files.some((entry) => entry.path === path)) {
      throw new Error(`${report.name} tarball is missing ${path}`);
    }
  }
}
