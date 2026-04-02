import fs from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import * as jsyaml from 'js-yaml';
import { z } from 'zod';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Build → parsers → build → mcp → FORGEWRIGHT_ROOT
const MCP_DIR = __dirname; // FORGEWRIGHT/mcp/build/parsers
const MCP_BUILD_DIR = dirname(MCP_DIR); // FORGEWRIGHT/mcp/build
const MCP_ROOT_DIR = dirname(MCP_BUILD_DIR); // FORGEWRIGHT/mcp
const FORGEWRIGHT_ROOT = dirname(MCP_ROOT_DIR); // FORGEWRIGHT
let resolvedRoot;
try {
    resolvedRoot = fs.realpathSync(FORGEWRIGHT_ROOT);
}
catch {
    resolvedRoot = FORGEWRIGHT_ROOT;
}
export let SKILLS_DIR = join(resolvedRoot, 'skills');
export function _setRootOverride(root) {
    resolvedRoot = root;
    SKILLS_DIR = join(resolvedRoot, 'skills');
}
export const FrontmatterSchema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    version: z.string().optional(),
    tags: z.array(z.string()).optional(),
});
function parseFrontmatter(content) {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    if (!match) {
        return { data: {}, body: content };
    }
    const [, yamlString, body] = match;
    try {
        const data = jsyaml.load(yamlString);
        return { data, body };
    }
    catch (e) {
        console.error('Failed to parse YAML frontmatter:', e);
        return { data: {}, body: content };
    }
}
function findAllSkillFiles(dir, fileList = []) {
    if (!fs.existsSync(dir))
        return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            findAllSkillFiles(filePath, fileList);
        }
        else if (file === 'SKILL.md') {
            fileList.push(filePath);
        }
    }
    return fileList;
}
export function getAllSkills() {
    if (!fs.existsSync(SKILLS_DIR)) {
        console.error(`[Forgewright Global MCP] Skills directory not found: ${SKILLS_DIR}`);
        return [];
    }
    const skillFiles = findAllSkillFiles(SKILLS_DIR);
    const skills = [];
    for (const filePath of skillFiles) {
        if (filePath.includes('_shared/protocols'))
            continue;
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const { data } = parseFrontmatter(content);
            const folderName = basename(dirname(filePath));
            const name = data.name || folderName;
            const description = data.description || `Forgewright Skill: ${name}`;
            skills.push({
                name,
                description,
                version: data.version,
                tags: data.tags,
                filePath,
                content,
            });
        }
        catch (e) {
            console.error(`[Forgewright Global MCP] Failed to read skill: ${filePath}`, e);
        }
    }
    return skills;
}
export function getSharedProtocols() {
    const protocolsDir = join(SKILLS_DIR, '_shared', 'protocols');
    if (!fs.existsSync(protocolsDir))
        return [];
    const files = fs.readdirSync(protocolsDir).filter((f) => f.endsWith('.md'));
    const protocols = [];
    for (const file of files) {
        const filePath = join(protocolsDir, file);
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const protocolId = file.replace('.md', '');
            protocols.push({
                name: `protocol-${protocolId}`,
                description: `Forgewright Shared Protocol: ${protocolId}`,
                uri: `fw://protocols/${protocolId}`,
                content,
            });
        }
        catch (e) {
            console.error(`[Forgewright Global MCP] Failed to read protocol: ${filePath}`, e);
        }
    }
    return protocols;
}
