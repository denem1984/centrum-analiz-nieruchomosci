#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const rules = [
  {
    name: "private key",
    pattern: new RegExp("-{5}BEGIN\\s+(?:(?:RSA|EC|OPENSSH|DSA|PGP)\\s+)?PRIVATE\\s+KEY-{5}", "gi"),
  },
  { name: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: "GitHub token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { name: "OpenAI token", pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/g },
  { name: "Anthropic token", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g },
  { name: "Supabase secret key", pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g },
  { name: "Render API key", pattern: /\brnd_[A-Za-z0-9]{20,}\b/g },
  {
    name: "long infrastructure credential",
    pattern: /\b([A-Z][A-Z0-9_]*)\b\s*[:=]\s*["']?([A-Fa-f0-9]{40,}|[A-Za-z0-9+/_-]{40,}={0,2})/gi,
  },
  {
    name: "AWS secret access key",
    pattern: /\bAWS_SECRET_ACCESS_KEY\s*[:=]\s*["']?([A-Za-z0-9/+=]{32,})/gi,
  },
  {
    name: "long credential assignment",
    pattern: /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD))\b\s*[:=]\s*["']?([A-Za-z0-9/+=._-]{16,})/gi,
  },
];

function isPublishable(name, value) {
  return /(?:ANON|PUBLISHABLE)/i.test(name) || /^sb_publishable_/i.test(value);
}

function lineAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function scanPattern(source, rule, relativePath, hits) {
  rule.pattern.lastIndex = 0;
  for (const match of source.matchAll(rule.pattern)) {
    const hasAssignmentGroups = match[1] && match[2];
    const value = hasAssignmentGroups ? match[2] : match[0];
    const keyName = hasAssignmentGroups ? match[1] : "";
    if (isPublishable(keyName, value)) continue;
    if (rule.name === "long infrastructure credential" && !/(?:CLOUDFLARE|R2|RENDER|SUPABASE)/i.test(keyName)) continue;

    if (rule.name === "JWT") {
      const prefix = source.slice(Math.max(0, match.index - 160), match.index);
      if (/(?:ANON|PUBLISHABLE)[A-Z0-9_]*\s*[:=]\s*["']?$/i.test(prefix)) continue;
    }

    hits.add(relativePath + ":" + lineAt(source, match.index) + ": " + rule.name);
  }
}

export function scanText(source, relativePath = "<memory>") {
  const hits = new Set();
  for (const rule of rules) scanPattern(source, rule, relativePath, hits);
  return [...hits];
}

function trackedFiles() {
  try {
    return execFileSync("git", ["-C", repoRoot, "ls-files", "-z"], {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "pipe"],
    }).toString("utf8").split("\0").filter(Boolean);
  } catch {
    process.stderr.write("Secret scan could not list Git-tracked files.\n");
    process.exit(2);
  }
}

function scanWorkingTree() {
  const hits = [];
  for (const relativePath of trackedFiles()) {
    const absolutePath = resolve(repoRoot, relativePath);
    if (absolutePath !== repoRoot && !absolutePath.startsWith(repoRoot + sep)) {
      hits.push(relativePath + ": invalid tracked path");
      continue;
    }

    let bytes;
    try {
      bytes = readFileSync(absolutePath);
    } catch {
      hits.push(relativePath + ": tracked file is missing from the working tree");
      continue;
    }

    if (bytes.includes(0)) continue;
    hits.push(...scanText(bytes.toString("utf8"), relativePath));
  }

  if (hits.length > 0) {
    process.stderr.write("Potential secrets found in Git-tracked files:\n");
    for (const hit of hits) process.stderr.write("- " + hit + "\n");
    return 1;
  }
  process.stdout.write("Secret scan passed (" + trackedFiles().length + " tracked files).\n");
  return 0;
}

function scanHistory() {
  let patch;
  try {
    patch = execFileSync("git", ["-C", repoRoot, "log", "--all", "-p", "--format=__M1_COMMIT__%H", "--no-color", "--"], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    process.stderr.write("History scan could not read Git history.\n");
    return 2;
  }

  const findings = [];
  let commit = "";
  let currentPath = "";
  let addedLines = [];
  let commits = 0;

  const flushFile = () => {
    if (!commit || !currentPath || addedLines.length === 0) return;
    const source = addedLines.join("\n");
    for (const hit of scanText(source, currentPath)) {
      findings.push(commit + ":" + hit);
    }
    addedLines = [];
  };

  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("__M1_COMMIT__")) {
      flushFile();
      commit = line.slice("__M1_COMMIT__".length);
      currentPath = "";
      commits += 1;
      continue;
    }
    if (line.startsWith("diff --git ")) {
      flushFile();
      currentPath = "";
      continue;
    }
    if (line.startsWith("+++ b/")) {
      currentPath = line.slice(6);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      addedLines.push(line.slice(1));
    }
  }
  flushFile();

  if (findings.length > 0) {
    process.stderr.write("Potential secrets found in added Git history lines (" + findings.length + " hits):\n");
    for (const finding of findings) process.stderr.write("- " + finding + "\n");
    return 1;
  }
  process.stdout.write("History secret scan passed (" + commits + " commits inspected; added lines only).\n");
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--history") {
    process.exit(scanHistory());
  }
  if (args.length > 0) {
    process.stderr.write("Usage: node scripts/check-no-secrets.mjs [--history]\n");
    process.exit(2);
  }
  process.exit(scanWorkingTree());
}
