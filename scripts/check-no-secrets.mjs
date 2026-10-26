#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let trackedOutput;

try {
  trackedOutput = execFileSync("git", ["-C", repoRoot, "ls-files", "-z"], {
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  process.stderr.write("Secret scan could not list Git-tracked files.\n");
  process.stderr.write(String(error.stderr ?? error.message));
  process.exit(2);
}

const trackedFiles = trackedOutput.toString("utf8").split("\0").filter(Boolean);
const rules = [
  {
    name: "private key",
    pattern: new RegExp("-{5}BEGIN\\s+(?:(?:RSA|EC|OPENSSH|DSA|PGP)\\s+)?PRIVATE\\s+KEY-{5}", "gi"),
  },
  { name: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: "GitHub token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { name: "OpenAI token", pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/g },
  { name: "Anthropic token", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g },
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
    const value = match[1] && match[2] ? match[2] : match[0];
    const keyName = match[1] && match[2] ? match[1] : "";
    if (isPublishable(keyName, value)) continue;

    if (rule.name === "JWT") {
      const prefix = source.slice(Math.max(0, match.index - 160), match.index);
      if (/(?:ANON|PUBLISHABLE)[A-Z0-9_]*\s*[:=]\s*["']?$/i.test(prefix)) continue;
    }

    hits.add(relativePath + ":" + lineAt(source, match.index) + ": " + rule.name);
  }
}

const hits = new Set();

for (const relativePath of trackedFiles) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (absolutePath !== repoRoot && !absolutePath.startsWith(repoRoot + sep)) {
    hits.add(relativePath + ": invalid tracked path");
    continue;
  }

  let bytes;
  try {
    bytes = readFileSync(absolutePath);
  } catch {
    hits.add(relativePath + ": tracked file is missing from the working tree");
    continue;
  }

  if (bytes.includes(0)) continue;
  const source = bytes.toString("utf8");
  for (const rule of rules) scanPattern(source, rule, relativePath, hits);
}

if (hits.size > 0) {
  process.stderr.write("Potential secrets found in Git-tracked files:\n");
  for (const hit of hits) process.stderr.write("- " + hit + "\n");
  process.exit(1);
}

process.stdout.write("Secret scan passed (" + trackedFiles.length + " tracked files).\n");
