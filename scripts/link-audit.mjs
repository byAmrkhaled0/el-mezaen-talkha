import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? htmlFiles(join(directory, entry.name)) : entry.name.endsWith(".html") ? [join(directory, entry.name)] : []));
  return nested.flat();
}

const files = await htmlFiles("dist");
let checked = 0;
for (const file of files) {
  const html = await readFile(file, "utf8");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  for (const match of html.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
    const raw = match[1].trim();
    assert.ok(raw && !["#", "undefined", "null"].includes(raw) && !raw.startsWith("javascript:"), `${relative("dist", file)} has invalid link: ${raw}`);
    if (raw.startsWith("#")) { assert.ok(ids.has(raw.slice(1)), `${relative("dist", file)} has missing anchor: ${raw}`); continue; }
    if (/^(?:https?:|mailto:|tel:|data:)/i.test(raw)) continue;
    const clean = raw.split(/[?#]/)[0];
    if (!clean) continue;
    const candidate = clean.startsWith("/") ? join("dist", clean) : join(dirname(file), clean);
    const options = clean.endsWith("/") ? [join(candidate, "index.html")] : [candidate, join(candidate, "index.html")];
    let found = false;
    for (const option of options) { try { await access(option); found = true; break; } catch {} }
    assert.ok(found, `${relative("dist", file)} points to missing local resource: ${raw}`);
    checked++;
  }
}
console.log(`Link audit passed: ${files.length} HTML routes and ${checked} local links/assets checked.`);
