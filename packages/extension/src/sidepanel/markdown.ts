// ============================================================
// Lightweight markdown renderer — handles the subset the AI
// produces in EXPLAIN actions (headings, bold, italic, lists,
// code, tables, paragraphs, LaTeX math via KaTeX).
// ============================================================

import katex from "katex";

export function renderMarkdown(text: string): string {
  if (!text) return "";

  const rawLines = text.trim().split("\n");
  const out: string[] = [];
  let inList: "ul" | "ol" | null = null;
  let inPara = false;
  let inTable = false;
  let tableRows: string[][] = [];
  let tableAligns: string[] = [];

  function flushPara(): void {
    if (inPara) {
      out.push("</p>");
      inPara = false;
    }
  }

  function flushList(): void {
    if (inList) {
      out.push(inList === "ul" ? "</ul>" : "</ol>");
      inList = null;
    }
  }

  function flushTable(): void {
    if (!inTable || tableRows.length === 0) { inTable = false; tableRows = []; return; }
    const hasHeader = tableRows.length >= 2 && /^[-:|\s]+$/.test(tableRows[1].join("|"));
    let header: string[] | null = null;
    let bodyStart = 0;

    if (hasHeader) {
      header = tableRows[0];
      bodyStart = 2;
      tableAligns = tableRows[1].map((cell) => {
        const c = cell.trim();
        if (c.startsWith(":") && c.endsWith(":")) return "center";
        if (c.endsWith(":")) return "right";
        return "left";
      });
    }

    out.push("<table class=\"md-table\">");
    if (header) {
      out.push("<thead><tr>");
      for (let ci = 0; ci < header.length; ci++) {
        const align = tableAligns[ci] ? ` style="text-align:${tableAligns[ci]}"` : "";
        out.push(`<th${align}>${renderInline(header[ci].trim())}</th>`);
      }
      out.push("</tr></thead>");
    }
    out.push("<tbody>");
    for (let ri = bodyStart; ri < tableRows.length; ri++) {
      out.push("<tr>");
      for (let ci = 0; ci < tableRows[ri].length; ci++) {
        const align = tableAligns[ci] ? ` style="text-align:${tableAligns[ci]}"` : "";
        out.push(`<td${align}>${renderInline(tableRows[ri][ci].trim())}</td>`);
      }
      out.push("</tr>");
    }
    out.push("</tbody></table>");
    inTable = false;
    tableRows = [];
    tableAligns = [];
  }

  function openPara(): void {
    if (!inPara) {
      flushList();
      flushTable();
      out.push("<p>");
      inPara = true;
    }
  }

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const trimmed = raw.trim();

    // Blank line
    if (!trimmed) {
      flushPara();
      flushList();
      flushTable();
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith("```")) {
      flushPara();
      flushList();
      flushTable();
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < rawLines.length) {
        if (rawLines[i].trim() === "```") break;
        codeLines.push(escapeHtml(rawLines[i]));
        i++;
      }
      const blockClass = lang ? ` class="md-code-block lang-${escapeHtml(lang)}"` : ' class="md-code-block"';
      out.push(`<pre><code${blockClass}>${codeLines.join("\n")}</code></pre>`);
      continue;
    }

    // Table row (starts and ends with |)
    const tableMatch = trimmed.match(/^\|(.+)\|$/);
    if (tableMatch) {
      if (!inTable) {
        flushPara();
        flushList();
        inTable = true;
      }
      tableRows.push(tableMatch[1].split("|"));
      continue;
    }
    if (inTable) {
      flushTable();
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      flushPara();
      flushList();
      const level = headingMatch[1].length;
      const content = renderInline(headingMatch[2]);
      out.push(`<h${level} class="md-heading">${content}</h${level}>`);
      continue;
    }

    // Unordered list
    const ulMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      flushPara();
      if (inList !== "ul") {
        flushList();
        out.push("<ul class=\"md-list\">");
        inList = "ul";
      }
      out.push(`<li>${renderInline(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      flushPara();
      if (inList !== "ol") {
        flushList();
        out.push("<ol class=\"md-list\">");
        inList = "ol";
      }
      out.push(`<li>${renderInline(olMatch[1])}</li>`);
      continue;
    }

    // Regular paragraph text
    openPara();
    if (inPara && out[out.length - 1] !== "<p>") {
      out.push("<br>");
    }
    out.push(renderInline(trimmed));
  }

  flushPara();
  flushList();
  flushTable();

  return out.join("\n");
}

// ── Inline formatting ────────────────────────────────────────

function renderInline(text: string): string {
  const mathBlocks: string[] = [];

  // Step 1: Render math blocks on raw unescaped text
  let out = text;

  // Display math ($$...$$) — render with KaTeX display mode
  out = out.replace(/\$\$([^$]+)\$\$/g, (_sub, expr) => {
    try {
      const rendered = katex.renderToString(expr.trim(), { throwOnError: false, displayMode: true });
      mathBlocks.push(rendered);
      return `\x00M${mathBlocks.length - 1}\x00`;
    } catch {
      return `$$${expr}$$`;
    }
  });

  // Inline math ($...$) — render with KaTeX inline mode
  out = out.replace(/\$([^$]+)\$/g, (_sub, expr) => {
    try {
      const rendered = katex.renderToString(expr.trim(), { throwOnError: false, displayMode: false });
      mathBlocks.push(rendered);
      return `\x00M${mathBlocks.length - 1}\x00`;
    } catch {
      return `$${expr}$`;
    }
  });

  // Step 2: Escape HTML on the remaining non-math text
  out = escapeHtml(out);

  // Bold + italic (3 stars)
  out = out.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");

  // Bold (2 stars)
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic (1 star — but not inside words like x*y)
  out = out.replace(/(^|\s)\*([^*\s][^*]*?)\*(\s|$)/g, "$1<em>$2</em>$3");

  // Inline code
  out = out.replace(/`([^`]+)`/g, "<code class=\"md-code\">$1</code>");

  // Step 3: Restore KaTeX-rendered math blocks
  out = out.replace(/\x00M(\d+)\x00/g, (_sub, idx) => {
    return mathBlocks[parseInt(idx)] ?? "";
  });

  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
