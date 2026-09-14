#!/usr/bin/env node
// Interactive CLI that appends a new entry to the RECORDINGS array in
// index.html, instead of hand-editing the JS. Computes `duration` from
// time/ends automatically and validates the date format before writing.
//
// Usage: node scripts/add-recording.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INDEX_HTML = path.join(ROOT, "index.html");

// Plain readline.question() over promises resolves empty as soon as the
// input stream hits EOF (e.g. piped/non-interactive input), even with
// buffered lines still pending. Queue lines from the 'line' event instead
// so prompts work the same whether stdin is a real TTY or piped.
const rl = readline.createInterface({ input: stdin });
const lineQueue = [];
const waiters = [];
let closed = false;
rl.on("line", (line) => {
  if (waiters.length) waiters.shift()(line);
  else lineQueue.push(line);
});
rl.on("close", () => {
  closed = true;
  while (waiters.length) waiters.shift()("");
});
const nextLine = () =>
  lineQueue.length
    ? Promise.resolve(lineQueue.shift())
    : closed
    ? Promise.resolve("")
    : new Promise((resolve) => waiters.push(resolve));

const ask = async (q, def = "") => {
  stdout.write(def ? `${q} [${def}]: ` : `${q}: `);
  const answer = (await nextLine()).trim();
  return answer || def;
};

function parseClockTime(s) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s.trim());
  if (!m) return null;
  let [, h, min, ap] = m;
  h = parseInt(h, 10);
  min = parseInt(min, 10);
  if (/pm/i.test(ap) && h !== 12) h += 12;
  if (/am/i.test(ap) && h === 12) h = 0;
  return h * 60 + min;
}

function computeDuration(time, ends) {
  const start = parseClockTime(time);
  const end = parseClockTime(ends);
  if (start === null || end === null) return null;
  let mins = end - start;
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function jsString(v) {
  return JSON.stringify(v);
}

async function main() {
  console.log("Add a new recording entry to index.html\n");

  const date = await ask("Date (YYYY-MM-DD)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`"${date}" is not a valid YYYY-MM-DD date.`);
    process.exit(1);
  }
  const time = await ask("Start time (e.g. 1:00 PM)");
  const ends = await ask("End time (e.g. 3:45 PM)");
  const brk = await ask("Break window, optional (e.g. 2:15 PM – 2:30 PM)");
  const subject = await ask("Subject");
  const faculty = await ask("Faculty");
  const lecture = await ask("Lecture label (e.g. Session 11)");
  const term = await ask("Term (e.g. Term 2 Phase 2)");
  const campus = (await ask("On campus? (y/N)", "n")).toLowerCase().startsWith("y");
  const url = await ask("Recording/meeting URL, optional");
  const passcode = await ask("Passcode, optional");
  const thumb = await ask("Thumbnail path, optional (e.g. thumbnails/FOO.png)");

  let duration = computeDuration(time, ends);
  if (!duration) {
    duration = await ask("Could not compute duration automatically, enter it (e.g. 2h 30m)");
  } else {
    console.log(`Computed duration: ${duration}`);
  }

  const fields = [
    ["date", date],
    ["time", time],
    ["ends", ends],
    ...(brk ? [["brk", brk]] : []),
    ["subject", subject],
    ["faculty", faculty],
    ["lecture", lecture],
    ["duration", duration],
    ["term", term],
    ...(campus ? [["campus", true]] : []),
    ...(thumb ? [["thumb", thumb]] : []),
    ["url", url],
    ["passcode", passcode],
  ];

  const entryLine =
    "  { " +
    fields.map(([k, v]) => `${k}:${typeof v === "boolean" ? v : jsString(v)}`).join(", ") +
    " },";

  const html = readFileSync(INDEX_HTML, "utf8");
  const closeIdx = html.indexOf("\n];", html.indexOf("const RECORDINGS = ["));
  if (closeIdx === -1) throw new Error("Could not find the RECORDINGS array closing `];` in index.html");

  // Ensure the previous last entry ends with a comma before we insert after it.
  let before = html.slice(0, closeIdx);
  const after = html.slice(closeIdx);
  before = before.replace(/(\}\s*)$/, (m) => (m.trimEnd().endsWith(",") ? m : m.trimEnd() + ",\n"));

  const updated = `${before}${entryLine}${after}`;
  writeFileSync(INDEX_HTML, updated);

  console.log("\nAdded entry:");
  console.log(entryLine);
  console.log("\nRun `node scripts/validate-data.mjs` to check it.");
  rl.close();
}

main().catch((err) => {
  console.error(err.stack || err.message);
  rl.close();
  process.exit(1);
});
