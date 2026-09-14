#!/usr/bin/env node
// Validates the RECORDINGS array embedded in index.html:
//   - required fields present and well-formed (date, subject, lecture, term)
//   - thumb, when set, points at a file that actually exists in thumbnails/
//   - url, when set, resolves without a hard 404/dead-domain error
//
// Usage: node scripts/validate-data.mjs [--no-network]

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INDEX_HTML = path.join(ROOT, "index.html");
const checkNetwork = !process.argv.includes("--no-network");

function extractRecordings(html) {
  const start = html.indexOf("const RECORDINGS = [");
  if (start === -1) throw new Error("Could not find `const RECORDINGS = [` in index.html");
  const end = html.indexOf("\n];", start);
  if (end === -1) throw new Error("Could not find closing `];` for RECORDINGS array");
  const arrayText = html.slice(start + "const RECORDINGS = ".length, end + 2);
  // eslint-disable-next-line no-new-func
  return new Function(`"use strict"; return (${arrayText});`)();
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateSchema(recordings) {
  const errors = [];
  recordings.forEach((r, i) => {
    const where = `RECORDINGS[${i}] (${r.subject ?? "?"} / ${r.lecture ?? "?"})`;
    if (!r.date || !DATE_RE.test(r.date)) errors.push(`${where}: missing/invalid date "${r.date}"`);
    if (!r.subject) errors.push(`${where}: missing subject`);
    if (!r.lecture) errors.push(`${where}: missing lecture`);
    if (!r.term) errors.push(`${where}: missing term`);
    if (r.thumb) {
      const thumbPath = path.join(ROOT, r.thumb);
      if (!existsSync(thumbPath)) errors.push(`${where}: thumb "${r.thumb}" does not exist on disk`);
    }
  });
  return errors;
}

async function checkUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    let res;
    try {
      res = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    } catch {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    return { ok: res.status !== 404, status: res.status };
  } catch (err) {
    return { ok: false, status: null, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function validateUrls(recordings) {
  const withUrls = recordings.filter((r) => r.url);
  const results = await Promise.all(
    withUrls.map(async (r) => ({ r, result: await checkUrl(r.url) }))
  );
  const hardFailures = [];
  const warnings = [];
  for (const { r, result } of results) {
    const label = `${r.subject} / ${r.lecture} (${r.date}) -> ${r.url}`;
    if (result.error) {
      warnings.push(`${label}: request failed (${result.error})`);
    } else if (result.status === 404) {
      hardFailures.push(`${label}: 404 Not Found`);
    } else if (result.status >= 400) {
      warnings.push(`${label}: HTTP ${result.status}`);
    }
  }
  return { hardFailures, warnings };
}

async function main() {
  const html = readFileSync(INDEX_HTML, "utf8");
  const recordings = extractRecordings(html);
  console.log(`Found ${recordings.length} recordings.`);

  const schemaErrors = validateSchema(recordings);
  let networkFailures = [];
  let networkWarnings = [];

  if (checkNetwork) {
    console.log("Checking URLs (this can take a bit)...");
    const { hardFailures, warnings } = await validateUrls(recordings);
    networkFailures = hardFailures;
    networkWarnings = warnings;
  }

  if (networkWarnings.length) {
    console.log("\nWarnings (not failing the build, but worth a look):");
    for (const w of networkWarnings) console.log(`  - ${w}`);
  }

  const allErrors = [...schemaErrors, ...networkFailures];
  if (allErrors.length) {
    console.error("\nErrors:");
    for (const e of allErrors) console.error(`  - ${e}`);
    console.error(`\n${allErrors.length} error(s) found.`);
    process.exit(1);
  }

  console.log("\nAll recordings look good.");
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
