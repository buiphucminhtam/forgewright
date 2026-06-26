import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";

export function findProjectRoot(startDir = process.cwd()): string {
  const explicitRoot =
    process.env.FORGEWRIGHT_WORKSPACE || process.env.AGENTS_WORKSPACE;
  if (explicitRoot) {
    return resolve(explicitRoot);
  }

  let current = resolve(startDir);

  while (true) {
    if (
      existsSync(join(current, ".forgewright")) ||
      existsSync(join(current, ".git"))
    ) {
      return current;
    }

    const parent = resolve(current, "..");
    if (parent === current) {
      return resolve(startDir);
    }
    current = parent;
  }
}

export function getProjectName(projectRoot: string): string {
  return basename(projectRoot);
}

export function getProductionConfigPath(projectRoot: string): string {
  return join(projectRoot, ".production-grade.yaml");
}

export function readProductionConfig(projectRoot: string): string {
  const configPath = getProductionConfigPath(projectRoot);
  if (!existsSync(configPath)) {
    return "";
  }
  return readFileSync(configPath, "utf-8");
}

export function writeProductionConfig(
  projectRoot: string,
  content: string,
): void {
  const configPath = getProductionConfigPath(projectRoot);
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(
    configPath,
    content.endsWith("\n") ? content : `${content}\n`,
    "utf-8",
  );
}

export function readTopLevelBlock(content: string, key: string): string | null {
  const pattern = new RegExp(
    `^${escapeRegExp(key)}:\\n(?:[ \\t].*\\n|\\n)*`,
    "m",
  );
  const match = content.match(pattern);
  return match ? match[0] : null;
}

export function upsertTopLevelBlock(
  content: string,
  key: string,
  block: string,
): string {
  const normalizedBlock = `${block.trimEnd()}\n`;
  const pattern = new RegExp(
    `^${escapeRegExp(key)}:\\n(?:[ \\t].*\\n|\\n)*`,
    "m",
  );

  if (pattern.test(content)) {
    return content.replace(pattern, normalizedBlock);
  }

  if (!content.trim()) {
    return normalizedBlock;
  }

  return `${content.trimEnd()}\n\n${normalizedBlock}`;
}

export function getScalar(block: string | null, key: string): string | null {
  if (!block) {
    return null;
  }

  const pattern = new RegExp(`^[ \\t]*${escapeRegExp(key)}:[ \\t]*(.+)$`, "m");
  const match = block.match(pattern);
  if (!match) {
    return null;
  }

  return match[1].trim().replace(/^["']|["']$/g, "");
}

export function parseBoolean(
  value: string | null,
  defaultValue: boolean,
): boolean {
  if (value === null) {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
}

export function parseNullableString(value: string | null): string | null {
  if (value === null || value.toLowerCase() === "null") {
    return null;
  }
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
