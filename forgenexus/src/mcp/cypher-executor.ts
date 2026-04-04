/**
 * ForgeNexus Cypher Executor
 * Full Cypher query parser + SQLite graph executor.
 *
 * Supports:
 *   MATCH (a)-[:EDGE]->(b)       — directed edge pattern
 *   MATCH (a)<-[:EDGE]-(b)         — reverse direction
 *   MATCH (a)-[:A|:B]->(c)         — OR edge types (parsed as combined string)
 *   MATCH (a)-[:EDGE*1..3]->(b)    — variable-length path (depth-limited)
 *   WHERE n.property = "value" OR n.property CONTAINS "value"
 *   RETURN a.name, a.filePath, b.type
 *   ORDER BY x.property ASC|DESC LIMIT N
 */

import type { ForgeDB } from "../data/db.js";
import type { CodeNode } from "../types.js";

export interface CypherResult {
  columns: string[];
  rows: Record<string, string | number | null>[];
  total: number;
  query: string;
  parseTime: number;
  execTime: number;
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface ParsedPattern {
  srcAlias: string;
  dstAlias: string;
  edgeType: string;
  srcLabel?: string;
  dstLabel?: string;
  srcName?: string;
  dstName?: string;
  direction: "out" | "in";
  minHops: number;
  maxHops: number;
}

interface ParsedQuery {
  pattern: ParsedPattern | null;
  returnVars: string[];
  orderBy?: { var: string; dir: "ASC" | "DESC" };
  limit?: number;
  where?: WhereClause;
}

interface WhereCondition {
  alias: string;
  prop: string;
  op: string;
  value: string | number | null;
}

interface WhereClause {
  conditions: WhereCondition[];
  logic: "AND" | "OR";
}

// ─── Tokenizer ───────────────────────────────────────────────────────────────

function tokenize(q: string): string[] {
  const toks: string[] = [];
  let i = 0;
  const s = q.trim();
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    if (s[i] === "-" && s[i + 1] === ">") { toks.push("->"); i += 2; continue; }
    if (s[i] === "<" && s[i + 1] === "-") { toks.push("<-"); i += 2; continue; }
    if (s[i] === "!" && s[i + 1] === "=") { toks.push("!="); i += 2; continue; }
    if (s[i] === "." && s[i + 1] === ".") { toks.push(".."); i += 2; continue; }
    if ("()[]{}*:|,=".includes(s[i])) { toks.push(s[i]); i++; continue; }
    if (s[i] === '"' || s[i] === "'") {
      const q2 = s[i++];
      let v = "";
      while (i < s.length && s[i] !== q2) {
        if (s[i] === "\\" && i + 1 < s.length) i++;
        v += s[i++];
      }
      i++;
      toks.push(q2 + v + q2);
      continue;
    }
    let w = "";
    while (i < s.length && !/[\s()\[\]{}:|,=<>!*"]/.test(s[i])) w += s[i++];
    if (w) toks.push(w);
  }
  return toks;
}

// ─── Parser ────────────────────────────────────────────────────────────────

/**
 * Parse a node pattern: (alias? :label? {name: "value"}?)
 * Returns: { alias, label, name, end } where `end` is the index AFTER the ")"
 */
function parseNode(toks: string[], start: number): {
  alias: string; label?: string; name?: string; end: number;
} {
  let i = start;
  if (toks[i] !== "(") return { alias: "", end: start };
  i++; // skip '('
  const alias = /^[a-z_]/i.test(toks[i] ?? "") ? toks[i++] : "";
  let label: string | undefined;
  if (toks[i] === ":") {
    i++; // skip ':'
    label = toks[i] ?? undefined;
    i++; // consume label token
  }
  let name: string | undefined;
  if (toks[i] === "{") {
    i++; // skip '{'
    while (toks[i] && toks[i] !== "}") {
      if (toks[i] === "name" && (toks[i + 1] === "=" || toks[i + 1] === ":")) {
        const afterName = toks[i + 1];
        // afterName is ":" or "=" — skip to the VALUE token
        i += 2; // skip "name:" or "name="
        const cur = toks[i];
        if (cur !== undefined && cur.length > 1 && (cur[0] === '"' || cur[0] === "'")) {
          name = cur.slice(1, -1);
        } else {
          name = cur ?? "";
        }
        i++; // advance past value token
      } else {
        i++;
      }
    }
    if (toks[i] === "}") i++; // skip '}'
  }
  // Advance to closing ")"
  while (i < toks.length && toks[i] !== ")") { i++; }
  return { alias: alias || `_n${start}`, label, name, end: i < toks.length ? i + 1 : i };
}

/** Parse a single condition: alias.prop op value */
function parseCondition(expr: string): WhereCondition | null {
  expr = expr.trim();
  if (!expr) return null;

  // IS NULL
  let m = expr.match(/^(\w+(?:\.\w+)*)\s+IS\s+(NOT\s+)?NULL$/i);
  if (m) return { alias: m[1].split(".")[0], prop: m[1].split(".")[1] ?? m[1], op: m[2] ? "IS_NOT_NULL" : "IS_NULL", value: null };

  // CONTAINS / STARTS_WITH / ENDS_WITH
  m = expr.match(/^(\w+(?:\.\w+)*)\s+(CONTAINS|STARTS_WITH|ENDS_WITH)\s+(?:"([^"]*)"|'([^']*)'|(\S+))$/i);
  if (m) {
    const val = m[3] ?? m[4] ?? m[5] ?? "";
    return { alias: m[1].split(".")[0], prop: m[1].split(".")[1] ?? m[1], op: m[2].toUpperCase(), value: val };
  }

  // Comparison ops
  const ops: [string, string][] = [["!=", "!="], [">=", "GTE"], ["<=", "LTE"], [">", "GT"], ["<", "LT"], ["=", "="]];
  for (const [op, code] of ops) {
    const idx = expr.indexOf(op);
    if (idx === -1) continue;
    let val = expr.slice(idx + op.length).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    const aliasPart = expr.slice(0, idx).trim();
    const dotIdx = aliasPart.indexOf(".");
    return {
      alias: dotIdx >= 0 ? aliasPart.slice(0, dotIdx) : aliasPart,
      prop: dotIdx >= 0 ? aliasPart.slice(dotIdx + 1) : aliasPart,
      op: code,
      value: isNaN(Number(val)) ? val : Number(val),
    };
  }

  return null;
}

function parseQuery(q: string): ParsedQuery {
  const toks = tokenize(q);
  const result: ParsedQuery = { pattern: null, returnVars: [] };

  let i = 0;
  while (i < toks.length) {
    const t = toks[i].toUpperCase();

    if (t === "MATCH" || t === "WITH") {
      i++;
      // Parse: (a)-[:TYPE*min..max]->(b)  or  (a)<-[:TYPE]-(b)
      const n1 = parseNode(toks, i);
      i = n1.end;
      // Skip tokens until we find "[" or a clause keyword (stop so WHERE/RETURN/ORDER/LIMIT are processed)
      while (i < toks.length && toks[i] !== "[" &&
             toks[i]?.toUpperCase() !== "WHERE" && toks[i]?.toUpperCase() !== "RETURN" &&
             toks[i]?.toUpperCase() !== "ORDER" && toks[i]?.toUpperCase() !== "LIMIT" &&
             toks[i]?.toUpperCase() !== "WITH") { i++; }
      if (toks[i] === "[") {
        i++; // skip '['
        if (toks[i] === ":") i++;
        const edgeType = toks[i] ?? "";
        i++;
        let direction: "out" | "in" = "out";
        let minHops = 1, maxHops = 1;
        if (toks[i] === "]") {
          i++;
        } else if (toks[i] === "*") {
          i++;
          const minMatch = toks[i]?.match(/^(\d+)/);
          minHops = minMatch ? parseInt(minMatch[1], 10) : 1;
          i++;
          if (toks[i] === ".") { i++; if (toks[i] === ".") i++; }
          const maxMatch = toks[i]?.match(/^(\d+)/);
          maxHops = maxMatch ? parseInt(maxMatch[1], 10) : minHops;
          i++;
          if (toks[i] === "]") { i++; }
        }
        while (toks[i] !== "(" && i < toks.length) {
          if (toks[i] === ">" || toks[i] === "->") direction = "out";
          if (toks[i] === "<" || toks[i] === "<-") direction = "in";
          i++;
        }
        const n2 = parseNode(toks, i);
        i = n2.end;
        result.pattern = {
          srcAlias: n1.alias, dstAlias: n2.alias,
          edgeType: edgeType.toUpperCase(),
          srcLabel: n1.label, dstLabel: n2.label,
          srcName: n1.name, dstName: n2.name,
          direction,
          minHops, maxHops,
        };
      }
      continue;
    }

    if (t === "WHERE") {
      i++;
      // Collect all tokens until RETURN, ORDER, or LIMIT
      const tokens: string[] = [];
      while (i < toks.length && toks[i].toUpperCase() !== "RETURN" &&
             toks[i].toUpperCase() !== "ORDER" && toks[i].toUpperCase() !== "WITH") {
        tokens.push(toks[i++]);
      }
      // Reassemble tokens into an expression string:
      // - Join with spaces
      // - Fix dot-separated identifiers: "f . name" → "f.name"
      // - Fix quoted strings: `"value"` → keep as-is
      let whereStr = tokens.join(" ");
      // Fix "f . name" → "f.name" (dot between identifiers)
      whereStr = whereStr.replace(/(\w)\s+\.\s+(\w)/g, "$1.$2");
      // Parse each condition by splitting on AND/OR
      const parts = whereStr.split(/\s+(AND|OR)\s+/i).map(s => s.trim()).filter(Boolean);
      const conditions: WhereCondition[] = [];
      let logic: "AND" | "OR" = "AND";
      for (const part of parts) {
        const upper = part.toUpperCase();
        if (upper === "AND" || upper === "OR") {
          logic = upper === "OR" ? "OR" : "AND";
          continue;
        }
        const cond = parseCondition(part);
        if (cond) conditions.push(cond);
      }
      if (conditions.length > 0) result.where = { conditions, logic };
      continue;
    }

    if (t === "RETURN") {
      i++;
      while (i < toks.length && toks[i].toUpperCase() !== "ORDER" &&
             toks[i].toUpperCase() !== "WITH" && toks[i].toUpperCase() !== "LIMIT") {
        if (toks[i] === ",") { i++; continue; }
        let v = toks[i++];
        if (toks[i] === ".") v += "." + toks[++i];
        if (v && v !== "*") result.returnVars.push(v);
      }
      continue;
    }

    if (t === "ORDER") {
      i += 2; // skip "ORDER BY"
      let v = toks[i++] ?? "";
      if (toks[i] === ".") v += "." + toks[++i];
      const dir: "ASC" | "DESC" = (toks[i] ?? "").toUpperCase() === "DESC" ? "DESC" : "ASC";
      if (toks[i]?.toUpperCase() === "DESC") i++;
      result.orderBy = { var: v, dir };
      continue;
    }

    if (t === "LIMIT") {
      result.limit = parseInt(toks[++i] ?? "10", 10);
      i++;
      continue;
    }

    i++;
  }

  return result;
}

// ─── Node matching ────────────────────────────────────────────────────────

const LABEL_MAP: Record<string, string> = {
  fn: "Function", func: "Function", function: "Function",
  cls: "Class", class: "Class",
  meth: "Method", method: "Method",
  int: "Interface", iface: "Interface", interface: "Interface",
  prop: "Property", property: "Property",
  var: "Variable", variable: "Variable",
  struct: "Struct", enum: "Enum",
  trait: "Trait", impl: "Impl",
  typealias: "TypeAlias", type_alias: "TypeAlias",
  module: "Module", file: "File", folder: "Folder",
};

function labelOf(raw?: string): string {
  if (!raw) return "";
  return LABEL_MAP[raw.toLowerCase()] ?? raw;
}

function matchNode(node: CodeNode, label?: string, name?: string): boolean {
  if (label && node.type !== labelOf(label)) return false;
  if (name && node.name !== name) return false;
  return true;
}

function matchValue(val: any, op: string, cmp: string | number | null): boolean {
  const str = String(val ?? "").toLowerCase();
  const c = String(cmp ?? "").toLowerCase();
  switch (op) {
    case "=": return str === c;
    case "!=": return str !== c;
    case "CONTAINS": return str.includes(c);
    case "STARTS_WITH": return str.startsWith(c);
    case "ENDS_WITH": return str.endsWith(c);
    case "GT": return Number(val) > Number(cmp);
    case "GTE": return Number(val) >= Number(cmp);
    case "LT": return Number(val) < Number(cmp);
    case "LTE": return Number(val) <= Number(cmp);
    case "IS_NULL": return val === null || val === undefined;
    case "IS_NOT_NULL": return val !== null && val !== undefined;
    default: return false;
  }
}

// ─── Resolve candidates ────────────────────────────────────────────────────

/** Extract WHERE conditions that apply to a given alias */
function getConditionsForAlias(where: ParsedQuery["where"], alias: string): WhereCondition[] {
  if (!where) return [];
  return where.conditions.filter(c => c.alias === alias);
}

/** Check if a node passes WHERE conditions */
function passesWhere(node: CodeNode, conds: WhereCondition[]): boolean {
  if (conds.length === 0) return true;
  return conds.every(c => matchValue((node as any)[c.prop], c.op, c.value));
}

function resolveCandidates(db: ForgeDB, pq: ParsedQuery, centerAlias: string, centerLabel?: string, centerName?: string): CodeNode[] {
  const centerWheres = getConditionsForAlias(pq.where, centerAlias);
  const hasCenterWhere = centerWheres.length > 0;

  let candidates: CodeNode[] = [];

  if (centerName) {
    candidates = db.getNodesByName(centerName);
  } else if (centerLabel) {
    // Use a larger limit if WHERE will filter further, to avoid missing matches
    const limit = hasCenterWhere ? 500 : 50;
    candidates = db.getNodesByType(labelOf(centerLabel) as any, limit);
  } else {
    const limit = hasCenterWhere ? 500 : 100;
    candidates = db.getNodesByType("Function" as any, limit);
  }

  if (!centerLabel && !centerName && !hasCenterWhere) return candidates;

  // Limit to prevent unbounded expensive traversal on large candidate sets
  if (candidates.length > 500) candidates = candidates.slice(0, 500);

  return candidates.filter(n => matchNode(n, centerLabel, centerName) && passesWhere(n, centerWheres));
}

// ─── Execute ────────────────────────────────────────────────────────────────

function exec(db: ForgeDB, pq: ParsedQuery): CypherResult {
  const t0 = Date.now();
  const limit = pq.limit ?? 30;

  if (!pq.pattern) {
    return { columns: [], rows: [], total: 0, query: "", parseTime: 0, execTime: Date.now() - t0 };
  }

  const { pattern } = pq;
  const returnVars = pq.returnVars.length > 0 ? pq.returnVars : [`${pattern.srcAlias}.name`, `${pattern.dstAlias}.name`];

  const results: Record<string, any>[] = [];

  // ── Resolve center candidates (the most constrained node in the pattern) ──
  const srcScore = (pattern.srcName ? 3 : 0) + (pattern.srcLabel ? 1 : 0);
  const dstScore = (pattern.dstName ? 3 : 0) + (pattern.dstLabel ? 1 : 0);
  const useDstCenter = dstScore >= srcScore;

  const centerAlias = useDstCenter ? pattern.dstAlias : pattern.srcAlias;
  const otherAlias  = useDstCenter ? pattern.srcAlias : pattern.dstAlias;
  const centerLabel = useDstCenter ? pattern.dstLabel : pattern.srcLabel;
  const centerName  = useDstCenter ? pattern.dstName  : pattern.srcName;
  const otherLabel  = useDstCenter ? pattern.srcLabel : pattern.dstLabel;

  // traverseOut: from center's perspective, are we going OUT (finding callees) or IN (finding callers)?
  // direction="out": a → b means src is caller, dst is callee
  // If center is src: we want callees → traverseOut=true
  // If center is dst: we want callers → traverseOut=false
  const traverseOut = pattern.direction === "out" ? !useDstCenter : useDstCenter;

  const candidates = resolveCandidates(db, pq, centerAlias, centerLabel, centerName);
  if (candidates.length === 0) {
    return { columns: returnVars, rows: [], total: 0, query: "", parseTime: 0, execTime: Date.now() - t0 };
  }

  // ── No edge pattern? Just return the candidates directly (WHERE-filtered) ──
  if (!pattern.edgeType) {
    for (const center of candidates) {
      results.push({ [centerAlias]: center, [otherAlias]: center });
      if (results.length >= limit) break;
    }
  } else {
  // ── Traverse from each candidate ──
  for (const center of candidates) {
    let related: CodeNode[] = [];

    switch (pattern.edgeType) {
      case "CALLS":
        if (pattern.maxHops > 1) {
          // Variable-length path: BFS
          related = traverseBFS(db, center.uid, pattern.maxHops);
        } else {
          const callees = db.getCallees(center.uid);
          const callers = db.getCallers(center.uid);
          related = traverseOut ? callees : callers;
        }
        break;
      case "IMPORTS":
        related = traverseOut ? [] : db.getImporters(center.uid);
        break;
      case "EXTENDS":
        related = db.getExtendees(center.uid);
        break;
      case "IMPLEMENTS":
        related = db.getImplementers(center.uid);
        break;
      case "HAS_METHOD":
        related = db.getMethods(center.uid);
        break;
      case "HAS_PROPERTY":
        related = db.getProperties(center.uid);
        break;
      case "MEMBER_OF":
        related = db.getMembersOf(center.uid);
        break;
      case "OVERRIDES":
        related = db.getOverrides(center.uid);
        break;
      case "CONTAINS":
        related = db.getNodesByFile(center.filePath);
        break;
      default: {
        // Generic edge query — try uid-based join first, then fall back to uid-normalized
        let rows = (db as any).db.prepare(`
          SELECT n.* FROM nodes n
          JOIN edges e ON n.uid = ${traverseOut ? "e.to_uid" : "e.from_uid"}
          WHERE e.from_uid = ? AND e.type = ?
        `).all(center.uid, pattern.edgeType) as any[];
        if (rows.length === 0) {
          const uidPrefix = `${center.filePath}:${center.type}:${center.name}`;
          const safePrefix = uidPrefix.replace(/_/g, '\\_');
          const selfCol = traverseOut ? "from_uid" : "to_uid";
          const otherCol = traverseOut ? "to_uid" : "from_uid";
          rows = (db as any).db.prepare(`
            SELECT n.* FROM nodes n
            JOIN edges e ON n.uid = e.${otherCol}
            WHERE e.${selfCol} LIKE ? ESCAPE '\\' AND e.type = ?
          `).all(safePrefix + ':%', pattern.edgeType) as any[];
        }
        related = rows.map(r => ({ uid: r.uid, type: r.type, name: r.name, filePath: r.file_path, line: r.line, endLine: r.end_line, column: r.column_num, returnType: r.return_type, parameterCount: r.parameter_count, declaredType: r.declared_type, language: r.language, signature: r.signature, community: r.community, process: r.process_name }));
      }
    }

    if (related.length === 0) continue;

    for (const rn of related) {
      // Filter by other node's label
      if (!matchNode(rn, otherLabel, undefined)) continue;

      // Apply WHERE
      if (pq.where) {
        const condResults = pq.where.conditions.map(c => {
          const node = c.alias === centerAlias ? center : c.alias === otherAlias ? rn : null;
          if (!node) return true;
          return matchValue((node as any)[c.prop], c.op, c.value);
        });
        const pass = pq.where.logic === "AND" ? condResults.every(Boolean) : condResults.some(Boolean);
        if (!pass) continue;
      }

      const row: Record<string, any> = {};
      row[centerAlias] = center;
      row[otherAlias] = rn;
      results.push(row);
      if (results.length >= limit * 2) break;
    }
    if (results.length >= limit * 2) break;
  }
  } // end no-edge-pattern branch

  // ── Sort ──
  if (pq.orderBy) {
    const [alias, prop] = pq.orderBy.var.split(".");
    results.sort((a, b) => {
      const av = String((a[alias] as any)?.[prop] ?? "").toLowerCase();
      const bv = String((b[alias] as any)?.[prop] ?? "").toLowerCase();
      return pq.orderBy!.dir === "ASC" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }

  // ── Project return vars ──
  const projected = results.slice(0, limit).map(row => {
    const out: Record<string, string | number | null> = {};
    for (const v of returnVars) {
      const [alias, prop] = v.split(".");
      const node = row[alias] as CodeNode | undefined;
      if (!node) { out[v] = null; continue; }
      const key = (prop ?? "name") as keyof CodeNode;
      out[v] = (node[key] as string | number | null) ?? null;
    }
    return out;
  });

  return {
    columns: returnVars,
    rows: projected,
    total: results.length,
    query: "",
    parseTime: 0,
    execTime: Date.now() - t0,
  };
}

/** BFS for variable-length path traversal (CALLS edges only, depth-limited) */
function traverseBFS(db: ForgeDB, startUid: string, maxDepth: number): CodeNode[] {
  const visited = new Set<string>();
  const queue: { uid: string; depth: number }[] = [{ uid: startUid, depth: 0 }];
  const results: CodeNode[] = [];

  while (queue.length > 0) {
    const { uid, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;
    const callees = db.getCallees(uid);
    for (const callee of callees) {
      if (!visited.has(callee.uid)) {
        visited.add(callee.uid);
        results.push(callee);
        queue.push({ uid: callee.uid, depth: depth + 1 });
      }
    }
  }
  return results;
}

// ─── Public API ──────────────────────────────────────────────────────────

export function executeCypher(db: ForgeDB, query: string): CypherResult {
  const t0 = Date.now();
  const pq = parseQuery(query);
  if (!pq.pattern && !pq.where) {
    return { columns: [], rows: [], total: 0, query, parseTime: 0, execTime: 0 };
  }
  if (!pq.pattern && pq.where) {
    let candidates: CodeNode[] = [];
    // For CONTAINS/STARTS_WITH on "name", use SQL LIKE search
    const nameCond = pq.where.conditions.find(c => c.prop === "name");
    if (nameCond) {
      if (nameCond.op === "CONTAINS") {
        candidates = db.searchNodes(String(nameCond.value), "contains", "Function" as any, 500);
      } else if (nameCond.op === "STARTS_WITH") {
        candidates = db.searchNodes(String(nameCond.value), "starts", "Function" as any, 500);
      } else if (nameCond.op === "=") {
        candidates = db.getNodesByName(String(nameCond.value));
      }
    }
    if (candidates.length === 0) {
      const typeCond = pq.where.conditions.find(c => c.prop === "type");
      if (typeCond) {
        candidates = db.getNodesByType(labelOf(String(typeCond.value)) as any, 2000);
      } else {
        candidates = db.getNodesByType("Function" as any, 2000);
      }
    }
    const rows = candidates.filter(n => {
      const condResults = pq.where!.conditions.map(c => {
        return matchValue((n as any)[c.prop], c.op, c.value);
      });
      return pq.where!.logic === "AND" ? condResults.every(Boolean) : condResults.some(Boolean);
    });
    const cols = pq.returnVars.length > 0 ? pq.returnVars : ["name"];
    return {
      columns: cols,
      rows: rows.slice(0, pq.limit ?? 30).map(n => {
        const out: Record<string, any> = {};
        for (const v of cols) {
          const [alias, prop] = v.split(".");
          out[v] = (n as any)[prop ?? "name"] ?? null;
        }
        return out;
      }),
      total: rows.length,
      query,
      parseTime: 0,
      execTime: Date.now() - t0,
    };
  }
  const result = exec(db, pq);
  result.query = query;
  result.parseTime = 0;
  return result;
}

export function formatCypherResult(result: CypherResult): string {
  if (result.rows.length === 0) {
    return `## Cypher Results\n\n**Query:** \`${result.query}\`\n\n_No results found._\n\n*parse: ${result.parseTime}ms · exec: ${result.execTime}ms*`;
  }
  const cols = result.columns;
  let md = `## Cypher Results\n\n`;
  md += `**Query:** \`${result.query}\`\n`;
  md += `**Total:** ${result.total} | parse: ${result.parseTime}ms · exec: ${result.execTime}ms\n\n`;
  md += `| ${cols.map(c => c.split(".").pop()!).join(" | ")} |\n`;
  md += `| ${cols.map(() => "---").join(" | ")} |\n`;
  for (const row of result.rows) {
    md += `| ${cols.map(c => {
      const val = row[c];
      if (val === null || val === undefined) return "_null_";
      const s = String(val);
      return s.length > 60 ? s.slice(0, 57) + "..." : s;
    }).join(" | ")} |\n`;
  }
  return md;
}
