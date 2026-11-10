import MarkdownIt from "markdown-it";
import type { DocsDiagram, DocsHeading, DocsLink } from "./types.js";
import { renderDiagramSvg } from "./diagrams.js";

export interface MarkdownRenderOptions {
  links?: DocsLink[];
  diagrams?: DocsDiagram[];
  resolveLink?: (target: string, link?: DocsLink) => string | undefined;
  engine?: "markdown-it" | "legacy";
}

export interface MarkdownRenderResult {
  html: string;
  headings: DocsHeading[];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasUnsafeRelativeSegments(candidate: string): boolean {
  if (!candidate || /[\u0000-\u001F\u007F]/.test(candidate)) return true;
  if (candidate.startsWith("/") || candidate.includes("\\")) return true;
  return candidate.split("/").some((part) => part === "..");
}

function safeUrl(value: string, resolvedByCatalog = false): string | null {
  const target = value.trim();
  if (!target || /[\u0000-\u001F\u007F]/.test(target)) return null;
  if (/^(?:javascript|vbscript|file|data|blob):/i.test(target))
    return null;
  if (/^\/\//.test(target)) return null;
  if (/^(?:https?:|mailto:|tel:|#)/i.test(target)) return target;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) return null;
  if (!resolvedByCatalog) {
    const clean = target.split(/[?#]/, 1)[0] ?? "";
    if (hasUnsafeRelativeSegments(clean)) return null;
    let current = clean;
    for (let depth = 0; depth < 3; depth += 1) {
      let decoded: string;
      try {
        decoded = decodeURIComponent(current);
      } catch {
        return null;
      }
      if (hasUnsafeRelativeSegments(decoded)) return null;
      if (decoded === current) break;
      current = decoded;
    }
  }
  return target;
}

function lookupResolvedLink(
  rawTarget: string,
  resolveLink?: (target: string, link?: DocsLink) => string | undefined,
): string | undefined {
  if (!resolveLink) return undefined;
  for (const candidate of [rawTarget, rawTarget.normalize("NFC")]) {
    const direct = resolveLink(candidate);
    if (direct !== undefined) return direct;
  }
  try {
    const decoded = decodeURIComponent(rawTarget);
    for (const candidate of [decoded, decoded.normalize("NFC")]) {
      if (candidate !== rawTarget) {
        const resolved = resolveLink(candidate);
        if (resolved !== undefined) return resolved;
      }
    }
  } catch {
    // Ignore malformed URI encoding
  }
  return undefined;
}

function inline(value: string, options: MarkdownRenderOptions): string {
  const tokens: string[] = [];
  const stash = (html: string): string => {
    const marker = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return marker;
  };
  let text = value.replace(/`([^`\n]+)`/g, (_, code: string) =>
    stash(`<code>${escapeHtml(code)}</code>`),
  );
  text = text.replace(
    /!\[([^\]]*)\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["']([^"']*)["'])?\)/g,
    (_, alt: string, wrapped: string, raw: string, title: string) => {
      const target = wrapped ?? raw;
      const resolved = lookupResolvedLink(target, options.resolveLink);
      const url = safeUrl(resolved ?? target, resolved !== undefined);
      if (!url) return escapeHtml(alt);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return stash(
        `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy">`,
      );
    },
  );
  text = text.replace(
    /\[([^\]]+)\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["']([^"']*)["'])?\)/g,
    (_, label: string, wrapped: string, raw: string, title: string) => {
      const target = wrapped ?? raw;
      const resolved = lookupResolvedLink(target, options.resolveLink);
      const url = safeUrl(resolved ?? target, resolved !== undefined);
      if (!url) return escapeHtml(label);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      const external = /^(?:https?:|mailto:|tel:)/i.test(url)
        ? ` rel="noreferrer"${/^https?:/i.test(url) ? ` target="_blank"` : ""}`
        : "";
      return stash(
        `<a href="${escapeHtml(url)}"${titleAttr}${external}>${inline(label, options)}</a>`,
      );
    },
  );
  text = escapeHtml(text)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  return text.replace(
    /\u0000(\d+)\u0000/g,
    (_, index: string) => tokens[Number(index)] ?? "",
  );
}

function slug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function isTableSeparator(line: string): boolean {
  const cells = line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|");
  return (
    cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell))
  );
}

function tableRow(line: string, options: MarkdownRenderOptions): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => inline(cell.trim(), options));
}

export function renderMarkdownDocumentLegacy(
  markdown: string,
  options: MarkdownRenderOptions = {},
): MarkdownRenderResult {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  const headings: DocsHeading[] = [];
  let index = 0;
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inFence = false;
  let fenceLanguage = "";
  let fenceLines: string[] = [];
  let tableHeader: string[] | null = null;
  let diagramIndex = 0;
  const flushParagraph = (): void => {
    if (paragraph.length) {
      output.push(`<p>${inline(paragraph.join(" ").trim(), options)}</p>`);
      paragraph = [];
    }
  };
  const closeList = (): void => {
    if (listType) output.push(`</${listType}>`);
    listType = null;
  };
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (inFence) {
      if (/^```/.test(trimmed)) {
        const source = fenceLines.join("\n");
        if (fenceLanguage.toLowerCase() === "mermaid") {
          const diagram = options.diagrams?.[diagramIndex];
          diagramIndex += 1;
          output.push(renderDiagram(diagram, source));
        } else {
          const code = escapeHtml(source);
          output.push(
            `<pre class="code-block"><code class="language-${escapeHtml(fenceLanguage || "text")}">${code}</code></pre>`,
          );
        }
        inFence = false;
        fenceLines = [];
      } else fenceLines.push(line);
      index += 1;
      continue;
    }
    const fence = trimmed.match(/^```\s*([\w-]*)\s*$/);
    if (fence) {
      flushParagraph();
      closeList();
      inFence = true;
      fenceLanguage = fence[1] ?? "";
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      closeList();
      const text = heading[2].replace(/[`*_~]/g, "").trim();
      const base = slug(text);
      const same = headings.filter((item) => item.slug === base).length;
      const headingSlug = same ? `${base}-${same}` : base;
      headings.push({
        level: heading[1].length,
        text,
        slug: headingSlug,
        line: index + 1,
      });
      output.push(
        `<h${heading[1].length} id="${escapeHtml(headingSlug)}">${inline(text, options)}</h${heading[1].length}>`,
      );
      index += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      flushParagraph();
      closeList();
      const quote: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      output.push(
        `<blockquote>${inline(quote.join(" "), options)}</blockquote>`,
      );
      continue;
    }
    if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)) {
      flushParagraph();
      const match = line.match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
      if (!match) {
        index += 1;
        continue;
      }
      const type: "ul" | "ol" = match[2] ? "ol" : "ul";
      if (listType !== type) {
        closeList();
        listType = type;
        output.push(`<${type}>`);
      }
      output.push(`<li>${inline(match[3], options)}</li>`);
      index += 1;
      continue;
    }
    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      isTableSeparator(lines[index + 1])
    ) {
      flushParagraph();
      closeList();
      tableHeader = tableRow(line, options);
      output.push(
        `<div class="table-scroll"><table><thead><tr>${tableHeader
          .map((cell) => `<th scope="col">${cell}</th>`)
          .join("")}</tr></thead><tbody>`,
      );
      index += 2;
      continue;
    }
    if (tableHeader && line.includes("|")) {
      output.push(
        `<tr>${tableRow(line, options)
          .map((cell) => `<td>${cell}</td>`)
          .join("")}</tr>`,
      );
      index += 1;
      continue;
    }
    if (tableHeader && !trimmed) {
      output.push("</tbody></table>");
      tableHeader = null;
      index += 1;
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      closeList();
      if (output.at(-1) === "</tbody></table>") output.pop();
      index += 1;
      continue;
    }
    if (/^([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)) {
      flushParagraph();
      closeList();
      output.push("<hr>");
      index += 1;
      continue;
    }
    paragraph.push(trimmed);
    index += 1;
  }
  if (inFence)
    output.push(
      `<pre class="code-block"><code>${escapeHtml(fenceLines.join("\n"))}</code></pre>`,
    );
  flushParagraph();
  closeList();
  if (tableHeader) output.push("</tbody></table>");
  return { html: output.join("\n"), headings };
}

export function renderMarkdownDocument(
  markdown: string,
  options: MarkdownRenderOptions = {},
): MarkdownRenderResult {
  const engine = options.engine ?? (process.env.FORGEWRIGHT_DOCS_MARKDOWN_ENGINE === "legacy" ? "legacy" : "markdown-it");
  if (engine === "legacy") {
    return renderMarkdownDocumentLegacy(markdown, options);
  }
  const headings: DocsHeading[] = [];
  const slugCounts = new Map<string, number>();
  let diagramIndex = 0;

  const md = new MarkdownIt({
    html: false,
    xhtmlOut: false,
    breaks: false,
    linkify: false,
    typographer: false,
  });

  md.validateLink = () => true;

  md.core.ruler.push("forgewright_headings_and_links", (state) => {
    for (let i = 0; i < state.tokens.length; i += 1) {
      const token = state.tokens[i];
      if (token.type === "heading_open") {
        const inlineToken = state.tokens[i + 1];
        const rawText = inlineToken && inlineToken.type === "inline" ? inlineToken.content : "";
        const cleanText = rawText.replace(/[`*_~]/g, "").trim();
        const base = slug(cleanText);
        const seen = slugCounts.get(base) ?? 0;
        slugCounts.set(base, seen + 1);
        const headingSlug = seen ? `${base}-${seen}` : base;
        const level = Number(token.tag.slice(1)) || 1;
        const line = token.map ? token.map[0] + 1 : 1;
        headings.push({ level, text: cleanText, slug: headingSlug, line });
        token.attrSet("id", headingSlug);
      }
      if (token.type === "inline" && token.children) {
        const nextChildren = [];
        for (let j = 0; j < token.children.length; j += 1) {
          const child = token.children[j];
          if (child.type === "link_open") {
            const rawHref = child.attrGet("href") ?? "";
            const resolved = lookupResolvedLink(rawHref, options.resolveLink);
            const url = safeUrl(resolved ?? rawHref, resolved !== undefined);
            if (!url) {
              // Strip unsafe link_open and its matching link_close, keeping inner text
              let depth = 1;
              j += 1;
              while (j < token.children.length && depth > 0) {
                const inner = token.children[j];
                if (inner.type === "link_open") depth += 1;
                else if (inner.type === "link_close") {
                  depth -= 1;
                  if (depth === 0) break;
                }
                if (depth > 0) nextChildren.push(inner);
                j += 1;
              }
              continue;
            }
            child.attrSet("href", url);
            if (/^(?:https?:|mailto:|tel:)/i.test(url)) {
              child.attrSet("rel", "noreferrer");
              if (/^https?:/i.test(url)) {
                child.attrSet("target", "_blank");
              }
            }
            nextChildren.push(child);
          } else if (child.type === "image") {
            const rawSrc = child.attrGet("src") ?? "";
            const resolved = lookupResolvedLink(rawSrc, options.resolveLink);
            const url = safeUrl(resolved ?? rawSrc, resolved !== undefined);
            const altText = child.content || (child.children?.map((c) => c.content).join("") ?? "");
            if (!url) {
              const textToken = new state.Token("text", "", 0);
              textToken.content = altText;
              nextChildren.push(textToken);
              continue;
            }
            child.attrSet("src", url);
            child.attrSet("alt", altText);
            child.attrSet("loading", "lazy");
            nextChildren.push(child);
          } else {
            nextChildren.push(child);
          }
        }
        token.children = nextChildren;
      }
    }
  });

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const info = (token.info || "").trim().split(/\s+/)[0] ?? "";
    const source = token.content.replace(/\n$/, "");
    if (info.toLowerCase() === "mermaid") {
      const diagram = options.diagrams?.[diagramIndex];
      diagramIndex += 1;
      return renderDiagram(diagram, source) + "\n";
    }
    const lang = escapeHtml(info || "text");
    return `<pre class="code-block"><code class="language-${lang}">${escapeHtml(source)}</code></pre>\n`;
  };

  md.renderer.rules.code_block = (tokens, idx) => {
    const source = tokens[idx].content.replace(/\n$/, "");
    return `<pre class="code-block"><code class="language-text">${escapeHtml(source)}</code></pre>\n`;
  };

  md.renderer.rules.table_open = () => '<div class="table-scroll"><table>';
  md.renderer.rules.table_close = () => "</table></div>\n";
  md.renderer.rules.th_open = (tokens, idx) => {
    const align = tokens[idx].attrGet("style");
    return align ? `<th scope="col" style="${escapeHtml(align)}">` : '<th scope="col">';
  };

  const html = md.render(markdown.replace(/\r\n?/g, "\n")).trim();
  return { html, headings };
}

function renderDiagram(
  diagram: DocsDiagram | undefined,
  source: string,
): string {
  const valid = diagram?.valid === true;
  const label = valid ? "Mermaid diagram" : "Invalid Mermaid diagram";
  const svg = valid ? renderDiagramSvg(diagram, diagram.type) : "";
  const fallbackLabels =
    diagram?.labels && diagram.labels.length > 0
      ? `<p>${escapeHtml(diagram.labels.join(" → "))}</p>`
      : "";
  return `<figure class="diagram" aria-label="${label}">
${svg}
<details class="diagram-fallback"${valid ? "" : " open"}>
<summary>Diagram source and text fallback</summary>
<pre><code class="language-mermaid">${escapeHtml(source)}</code></pre>
${fallbackLabels}
</details>
</figure>`;
}

export function renderMarkdown(
  markdown: string,
  options: MarkdownRenderOptions = {},
): string {
  return renderMarkdownDocument(markdown, options).html;
}
