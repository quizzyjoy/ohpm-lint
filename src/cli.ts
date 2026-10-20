#!/usr/bin/env node
import fs from 'node:fs';
import { applyConfig, findConfigPath, listConfiguredOff, loadConfig, sizeOptionsFrom, EMPTY_CONFIG } from './core/config.js';
import { lint } from './core/lint.js';
import type { Issue } from './core/types.js';
import { jsonReport } from './reporters/json.js';
import { prettyReport } from './reporters/pretty.js';

interface Options {
  target: string | null;
  json: boolean;
  strict: boolean;
  quiet: boolean;
  color: boolean;
  ignore: string[];
  config: string | null;
}

const HELP = `ohpm-lint — 发布前检查你的 OHPM/HAR 包是否符合中心仓要求

用法:
  ohpm-lint <path>                 目录（库模块根）或 .har 文件
  ohpm-lint <path> --json          机器可读输出（CI 用）
  ohpm-lint <path> --strict        把 warn 当作 error（退出码随之变为 1）
  ohpm-lint <path> --ignore OHPM-FILE-04,OHPM-DOC-01
  ohpm-lint <path> --config .ohpmlintrc.json5
  ohpm-lint <path> --no-color --quiet

退出码:
  0  没有 error
  1  存在 error（--strict 时含 warn）
  2  工具自身失败（路径不存在、解包失败等）

规则依据: https://ohpm.openharmony.cn/#/cn/help/publishrules
`;

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (parsed === 'help') {
    process.stdout.write(HELP);
    return 0;
  }
  if (parsed === 'version') {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }
  if (typeof parsed === 'string') {
    process.stderr.write(`ohpm-lint: ${parsed}\n\n${HELP}`);
    return 2;
  }
  if (parsed.target === null) {
    process.stderr.write(`ohpm-lint: 缺少目标路径\n\n${HELP}`);
    return 2;
  }

  const version = readVersion();

  // 配置：--config 显式指定 > 目标目录 > 当前目录
  let config = EMPTY_CONFIG;
  try {
    const configPath = findConfigPath(parsed.config ?? undefined, [parsed.target, process.cwd()]);
    if (configPath !== null) config = loadConfig(configPath);
  } catch (error) {
    process.stderr.write(`ohpm-lint: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const ignored = [...new Set([...parsed.ignore, ...listConfiguredOff(config)])];

  let result;
  try {
    result = lint(parsed.target, { sizeOptions: sizeOptionsFrom(config) });
  } catch (error) {
    process.stderr.write(`ohpm-lint: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  const issues: Issue[] = applyConfig(result.issues, config)
    .filter((item) => !parsed.ignore.includes(item.rule))
    .map((item) => (parsed.strict && item.severity === 'warn' ? { ...item, severity: 'error' as const } : item));

  const visible = { ...result, issues };

  if (parsed.json) {
    process.stdout.write(`${jsonReport(visible, version, ignored)}\n`);
  } else {
    process.stdout.write(`${prettyReport(visible, {
      color: parsed.color,
      quiet: parsed.quiet,
      ignored,
      version
    })}\n`);
  }

  const errorCount = issues.filter((item) => item.severity === 'error').length;
  return errorCount > 0 ? 1 : 0;
}

function parseArgs(argv: string[]): Options | 'help' | 'version' | string {
  const options: Options = {
    target: null,
    json: false,
    strict: false,
    quiet: false,
    color: process.stdout.isTTY === true,
    ignore: [],
    config: null
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';

    if (arg === '-h' || arg === '--help') return 'help';
    if (arg === '-v' || arg === '--version') return 'version';
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--quiet') {
      options.quiet = true;
      continue;
    }
    if (arg === '--no-color') {
      options.color = false;
      continue;
    }
    if (arg === '--color') {
      options.color = true;
      continue;
    }
    if (arg === '--ignore') {
      const value = argv[++i];
      if (value === undefined) return '--ignore 缺少参数值';
      options.ignore.push(...splitList(value));
      continue;
    }
    if (arg.startsWith('--ignore=')) {
      options.ignore.push(...splitList(arg.slice('--ignore='.length)));
      continue;
    }
    if (arg === '--config') {
      const value = argv[++i];
      if (value === undefined) return '--config 缺少参数值';
      options.config = value;
      continue;
    }
    if (arg.startsWith('--config=')) {
      options.config = arg.slice('--config='.length);
      continue;
    }
    if (arg.startsWith('-')) {
      return `未知参数: ${arg}`;
    }
    if (options.target !== null) {
      return `一次只能检查一个目标（已收到 "${options.target}" 与 "${arg}"）`;
    }
    options.target = arg;
  }

  return options;
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function readVersion(): string {
  try {
    const url = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(fs.readFileSync(url, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

process.exitCode = main(process.argv.slice(2));
