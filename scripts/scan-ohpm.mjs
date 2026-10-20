#!/usr/bin/env node
/**
 * Batch-scan published OHPM packages with ohpm-lint.
 *
 *   node scripts/scan-ohpm.mjs @ohos/lottie @ohos/axios
 *   node scripts/scan-ohpm.mjs --out scan.json @ohos/mpchart
 *
 * Requires a built CLI (npm run build). Downloads each package's latest .har
 * from the OHPM registry, lints it, and prints a summary table.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REGISTRY = 'https://ohpm.openharmony.cn/ohpm/';
const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, '..', 'dist', 'cli.js');

const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const outFile = outIndex === -1 ? null : argv[outIndex + 1];
const packages = argv.filter((arg, index) => !arg.startsWith('--') && (outIndex === -1 || index !== outIndex + 1));

if (packages.length === 0) {
  console.error('usage: node scripts/scan-ohpm.mjs [--out result.json] <pkg> [pkg...]');
  process.exit(2);
}
if (!fs.existsSync(CLI)) {
  console.error(`missing ${CLI} — run "npm run build" first`);
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpm-scan-'));
const results = [];

for (const name of packages) {
  const entry = { name };
  try {
    const meta = await (await fetch(REGISTRY + name)).json();
    const latest = meta['dist-tags']?.latest;
    const version = latest ? meta.versions?.[latest] : undefined;
    if (!version) throw new Error('no latest version');

    entry.version = latest;
    entry.license = version.license || '';
    entry.published = meta.time?.[latest] || null;

    const buffer = Buffer.from(await (await fetch(version.dist.tarball)).arrayBuffer());
    entry.harBytes = buffer.length;

    const file = path.join(tmp, name.replace(/[@/]/g, '_') + '.har');
    fs.writeFileSync(file, buffer);

    const run = spawnSync(process.execPath, [CLI, file, '--json', '--no-color'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180000
    });
    if (run.status === 2) throw new Error('lint failed: ' + (run.stderr || '').slice(0, 200));

    const payload = JSON.parse(run.stdout);
    entry.exitCode = run.status;
    entry.summary = payload.summary;
    entry.issues = payload.issues.map((issue) => ({ rule: issue.rule, severity: issue.severity, title: issue.title }));
    fs.rmSync(file, { force: true });
  } catch (error) {
    entry.error = error instanceof Error ? error.message : String(error);
  }
  results.push(entry);
  const status = entry.error ? `ERR ${entry.error}` : `e${entry.summary.error} w${entry.summary.warn} i${entry.summary.info}`;
  console.log(`${entry.name}@${entry.version ?? '?'}  ${status}`);
}

if (outFile !== null) {
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`wrote ${outFile}`);
}
