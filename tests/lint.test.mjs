import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { packTar } from '../dist/core/tar.js';
import { lint } from '../dist/core/lint.js';
import { DEFAULT_SIZE_OPTIONS, sizeRules } from '../dist/rules/size.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');
const fixturesDir = path.join(repoRoot, 'fixtures');

function collectFiles(dir, prefix) {
  const out = [];
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childAbs = path.join(abs, entry.name);
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(childAbs, childRel);
      else if (entry.isFile()) out.push({ path: childRel, data: fs.readFileSync(childAbs) });
    }
  };
  walk(dir, prefix);
  return out;
}

function makeHar(packageDir, prefix = 'package') {
  const tar = packTar(collectFiles(packageDir, prefix));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ohpm-lint-test-')), 'fixture.har');
  fs.writeFileSync(file, gzipSync(tar));
  return file;
}

const fixtures = fs
  .readdirSync(fixturesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => fs.existsSync(path.join(fixturesDir, name, 'expected.json')));

assert.ok(fixtures.length > 0, 'no fixtures found');

for (const name of fixtures) {
  test(`fixture: ${name}`, () => {
    const expected = JSON.parse(fs.readFileSync(path.join(fixturesDir, name, 'expected.json'), 'utf8'));
    const har = makeHar(path.join(fixturesDir, name, 'package'));
    const result = lint(har);

    const actual = result.issues.map((issue) => issue.rule).sort();
    const want = [...expected.expect].sort();
    assert.deepEqual(actual, want, `${name}: ${JSON.stringify(result.issues, null, 2)}`);
  });
}

test('dir mode: module directory without package/ passes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpm-lint-dir-'));
  fs.cpSync(path.join(fixturesDir, 'pass-minimal', 'package'), dir, { recursive: true });

  const result = lint(dir);
  assert.deepEqual(result.issues, []);
  assert.equal(result.context.kind, 'dir');
});

test('har without package/ is rejected', () => {
  const flat = makeHar(path.join(fixturesDir, 'pass-minimal', 'package'), '');
  const result = lint(flat);
  const rules = result.issues.map((issue) => issue.rule);

  assert.ok(rules.includes('OHPM-STRUCT-01'), `expected STRUCT-01, got ${rules.join(',')}`);
});

test('errors carry official refs and hints', () => {
  const har = makeHar(path.join(fixturesDir, 'fail-changelog-no-version', 'package'));
  const result = lint(har);
  const issue = result.issues.find((item) => item.rule === 'OHPM-FILE-03');

  assert.ok(issue);
  assert.equal(issue.severity, 'error');
  assert.equal(issue.officialRef, '§7.1');
  assert.ok(issue.hint.length > 0);
  assert.equal(issue.path, 'package/CHANGELOG.md');
});

test('cli: --json exits 1 and reports the failing rule', () => {
  const har = makeHar(path.join(fixturesDir, 'fail-readme-mismatch', 'package'));
  const cli = path.join(repoRoot, 'dist', 'cli.js');
  const run = spawnSync(process.execPath, [cli, har, '--json'], { encoding: 'utf8' });

  assert.equal(run.status, 1, run.stderr);
  const payload = JSON.parse(run.stdout);
  assert.equal(payload.tool, 'ohpm-lint');
  assert.equal(payload.summary.error > 0, true);
  assert.ok(payload.issues.some((issue) => issue.rule === 'OHPM-FILE-04'));
  assert.ok(payload.skipped.some((item) => item.rule === 'OHPM-VER-03'));
});

test('cli: --strict escalates warnings, --ignore silences rules', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpm-lint-cli-'));
  fs.cpSync(path.join(fixturesDir, 'pass-minimal', 'package'), dir, { recursive: true });

  // break only a soft field -> META-05 warn (no error)
  const manifestPath = path.join(dir, 'oh-package.json5');
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  fs.writeFileSync(manifestPath, manifest.replace(/homepage: '[^']*'/, "homepage: 'not-a-url'"));

  const cli = path.join(repoRoot, 'dist', 'cli.js');

  const base = spawnSync(process.execPath, [cli, dir, '--json'], { encoding: 'utf8' });
  assert.equal(base.status, 0, base.stderr);
  assert.equal(JSON.parse(base.stdout).summary.warn, 1);

  const strict = spawnSync(process.execPath, [cli, dir, '--json', '--strict'], { encoding: 'utf8' });
  assert.equal(strict.status, 1, strict.stderr);

  const ignored = spawnSync(process.execPath, [cli, dir, '--json', '--ignore', 'OHPM-META-05'], { encoding: 'utf8' });
  assert.equal(ignored.status, 0, ignored.stderr);
  const payload = JSON.parse(ignored.stdout);
  assert.equal(payload.issues.length, 0);
  assert.deepEqual(payload.ignored, ['OHPM-META-05']);
});

test('cli: missing path exits 2', () => {
  const cli = path.join(repoRoot, 'dist', 'cli.js');
  const run = spawnSync(process.execPath, [cli, path.join(os.tmpdir(), 'definitely-not-here-ohpm-lint')], {
    encoding: 'utf8'
  });
  assert.equal(run.status, 2);
});

// ---------- P2: size / doc / config ----------

const MB = 1024 * 1024;

function fakeContext(files, archiveBytes) {
  return {
    kind: 'har',
    targetPath: 'pkg.har',
    root: '/tmp/pkg',
    packageDir: '/tmp/pkg/package',
    files,
    manifest: { name: '@x/y', version: '0.1.0' },
    manifestRaw: '{}',
    manifestError: null,
    manifestPath: 'oh-package.json5',
    sourceType: 'open',
    archiveBytes
  };
}

test('size: 501MB archive triggers SIZE-01', () => {
  const issues = sizeRules(fakeContext([{ path: 'Index.ets', size: 10 }], 501 * MB), DEFAULT_SIZE_OPTIONS);
  assert.ok(issues.some((issue) => issue.rule === 'OHPM-SIZE-01'));
});

test('size: unpacked over 1500MB triggers SIZE-02', () => {
  const issues = sizeRules(fakeContext([{ path: 'big.bin', size: 1600 * MB }], 10 * MB), DEFAULT_SIZE_OPTIONS);
  assert.ok(issues.some((issue) => issue.rule === 'OHPM-SIZE-02'));
});

test('size: more than 102400 files triggers SIZE-03', () => {
  const files = Array.from({ length: 102401 }, (_value, index) => ({ path: `f/${index}.txt`, size: 1 }));
  const issues = sizeRules(fakeContext(files, 10 * MB), DEFAULT_SIZE_OPTIONS);
  assert.ok(issues.some((issue) => issue.rule === 'OHPM-SIZE-03'));
});

test('size: README over 10MB triggers SIZE-04 with path', () => {
  const issues = sizeRules(
    fakeContext([{ path: 'README.md', size: 11 * MB }], 10 * MB),
    DEFAULT_SIZE_OPTIONS
  );
  const issue = issues.find((item) => item.rule === 'OHPM-SIZE-04');
  assert.ok(issue);
  assert.equal(issue.path, 'package/README.md');
});

test('size: quality budget emits SIZE-05 with top files', () => {
  const issues = sizeRules(
    fakeContext(
      [
        { path: 'resources/big.png', size: 20 * MB },
        { path: 'Index.ets', size: 1024 }
      ],
      20 * MB
    ),
    DEFAULT_SIZE_OPTIONS
  );
  const issue = issues.find((item) => item.rule === 'OHPM-SIZE-05');
  assert.ok(issue);
  assert.equal(issue.severity, 'warn');
  assert.ok(issue.message.includes('resources/big.png'));
});

test('size: custom thresholds are honoured', () => {
  const issues = sizeRules(fakeContext([{ path: 'a.bin', size: 2 * MB }], 2 * MB), {
    warnMb: 1,
    strongMb: 5
  });
  assert.ok(issues.some((item) => item.rule === 'OHPM-SIZE-05'));
});

test('doc: missing README sections are reported one by one', () => {
  const har = makeHar(path.join(fixturesDir, 'warn-doc', 'package'));
  const result = lint(har);
  const docIssues = result.issues.filter((issue) => issue.rule === 'OHPM-DOC-01');

  assert.equal(docIssues.length, 3, JSON.stringify(docIssues, null, 2));
  assert.ok(docIssues.every((issue) => issue.severity === 'warn'));
});

test('file: private key content is detected (runtime-generated, never committed)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpm-lint-key-'));
  fs.cpSync(path.join(fixturesDir, 'pass-minimal', 'package'), dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'notes.txt'),
    '-----BEGIN RSA PRIVATE KEY-----\nZml4dHVyZQ==\n-----END RSA PRIVATE KEY-----\n'
  );

  const result = lint(dir);
  const issue = result.issues.find((item) => item.rule === 'OHPM-FILE-06');
  assert.ok(issue, 'expected OHPM-FILE-06 for private key content');
  assert.equal(issue.severity, 'error');
});

test('file: a source HAR may ship src/*.ets without a leak warning', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpm-lint-src-'));
  fs.cpSync(path.join(fixturesDir, 'pass-minimal', 'package'), dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'main', 'ets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'main', 'ets', 'Foo.ets'), 'export const a = 1;\n');

  const har = makeHar(dir);
  const result = lint(har);
  assert.ok(!result.issues.some((item) => item.rule === 'OHPM-FILE-07'), 'source HAR must not be flagged');
});

test('file: install command with an explicit version still matches the package name', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpm-lint-ver-'));
  fs.cpSync(path.join(fixturesDir, 'pass-minimal', 'package'), dir, { recursive: true });
  const readme = path.join(dir, 'README.md');
  fs.writeFileSync(
    readme,
    fs.readFileSync(readme, 'utf8').replace('ohpm install @quizzyjoy/lintprobe', 'ohpm install @quizzyjoy/lintprobe@0.1.0')
  );

  const result = lint(makeHar(dir));
  assert.ok(!result.issues.some((item) => item.rule === 'OHPM-FILE-04'), JSON.stringify(result.issues, null, 2));
});

test('npm-style package gets a single info instead of HAR-spec errors', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpm-lint-npm-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'pako', version: '2.1.0' }));
  fs.writeFileSync(path.join(dir, 'README.md'), '# pako\n');

  const result = lint(dir);
  assert.equal(result.context.distribution, 'npm');
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].rule, 'OHPM-PKG-01');
  assert.equal(result.issues[0].severity, 'info');
});

test('cli: .ohpmlintrc.json5 can turn a rule off', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpm-lint-config-'));
  fs.cpSync(path.join(fixturesDir, 'warn-doc', 'package'), dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.ohpmlintrc.json5'), "{ rules: { 'OHPM-DOC-01': 'off' } }\n");

  const cli = path.join(repoRoot, 'dist', 'cli.js');
  const run = spawnSync(process.execPath, [cli, dir, '--json'], { encoding: 'utf8' });

  assert.equal(run.status, 0, run.stderr);
  const payload = JSON.parse(run.stdout);
  assert.equal(payload.issues.length, 0);
  assert.ok(payload.ignored.includes('OHPM-DOC-01'));
});

test('cli: --config can escalate severity', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpm-lint-config2-'));
  fs.cpSync(path.join(fixturesDir, 'warn-doc', 'package'), dir, { recursive: true });

  const configPath = path.join(dir, 'strict.json5');
  fs.writeFileSync(configPath, "{ severity: { 'OHPM-DOC-01': 'error' } }\n");

  const cli = path.join(repoRoot, 'dist', 'cli.js');
  const run = spawnSync(process.execPath, [cli, dir, '--json', '--config', configPath], { encoding: 'utf8' });

  assert.equal(run.status, 1, run.stderr);
  const payload = JSON.parse(run.stdout);
  assert.ok(payload.issues.length > 0);
  assert.ok(payload.issues.every((issue) => issue.severity === 'error'));
});

test('cli: --config with size thresholds', () => {
  const har = makeHar(path.join(fixturesDir, 'pass-minimal', 'package'));
  const configPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ohpm-lint-config3-')), 'size.json5');
  fs.writeFileSync(configPath, "{ rules: { 'OHPM-SIZE-05': { warnMb: 0, strongMb: 0 } } }\n");

  const cli = path.join(repoRoot, 'dist', 'cli.js');
  const run = spawnSync(process.execPath, [cli, har, '--json', '--config', configPath], { encoding: 'utf8' });

  assert.equal(run.status, 0, run.stderr);
  const payload = JSON.parse(run.stdout);
  assert.ok(payload.issues.some((issue) => issue.rule === 'OHPM-SIZE-05'));
});
