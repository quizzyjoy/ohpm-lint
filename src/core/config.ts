import fs from 'node:fs';
import path from 'node:path';
import JSON5 from 'json5';
import { DEFAULT_SIZE_OPTIONS, type SizeOptions } from '../rules/size.js';
import type { Issue, Severity } from './types.js';

export type RuleSetting = 'off' | Severity | { warnMb?: number; strongMb?: number };

export interface LintConfig {
  rules: Record<string, RuleSetting>;
  severity: Record<string, Severity>;
}

export const EMPTY_CONFIG: LintConfig = { rules: {}, severity: {} };

const SEVERITIES = new Set<string>(['error', 'warn', 'info']);
const CONFIG_NAME = '.ohpmlintrc.json5';

/** Explicit `--config` wins; otherwise look for `.ohpmlintrc.json5` in target dir then cwd. */
export function findConfigPath(explicit: string | undefined, searchDirs: string[]): string | null {
  if (explicit !== undefined) {
    const abs = path.resolve(explicit);
    if (!fs.existsSync(abs)) throw new Error(`配置文件不存在: ${abs}`);
    return abs;
  }

  for (const dir of searchDirs) {
    const candidate = path.join(dir, CONFIG_NAME);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function loadConfig(file: string): LintConfig {
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`无法读取配置文件 ${file}: ${message(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON5.parse(raw);
  } catch (error) {
    throw new Error(`配置文件不是合法 JSON5: ${message(error)}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('配置文件必须是 JSON5 对象');
  }

  const source = parsed as Record<string, unknown>;
  const config: LintConfig = { rules: {}, severity: {} };

  const rules = source['rules'];
  if (rules !== undefined) {
    if (rules === null || typeof rules !== 'object' || Array.isArray(rules)) {
      throw new Error('config.rules 必须是对象');
    }
    for (const [rule, value] of Object.entries(rules as Record<string, unknown>)) {
      if (value === 'off' || (typeof value === 'string' && SEVERITIES.has(value))) {
        config.rules[rule] = value as RuleSetting;
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const options = value as Record<string, unknown>;
        for (const key of ['warnMb', 'strongMb']) {
          if (options[key] !== undefined && typeof options[key] !== 'number') {
            throw new Error(`config.rules["${rule}"].${key} 必须是数字`);
          }
        }
        config.rules[rule] = options as RuleSetting;
      } else {
        throw new Error(`config.rules["${rule}"] 只能是 "off" / "error" / "warn" / "info" 或选项对象`);
      }
    }
  }

  const severity = source['severity'];
  if (severity !== undefined) {
    if (severity === null || typeof severity !== 'object' || Array.isArray(severity)) {
      throw new Error('config.severity 必须是对象');
    }
    for (const [rule, value] of Object.entries(severity as Record<string, unknown>)) {
      if (typeof value !== 'string' || !SEVERITIES.has(value)) {
        throw new Error(`config.severity["${rule}"] 只能是 "error" / "warn" / "info"`);
      }
      config.severity[rule] = value as Severity;
    }
  }

  return config;
}

/** 应用 off / 级别覆盖（SIZE-05 的阈值在 lint 阶段生效）。 */
export function applyConfig(issues: Issue[], config: LintConfig): Issue[] {
  const result: Issue[] = [];

  for (const issue of issues) {
    const setting = config.rules[issue.rule] ?? config.severity[issue.rule];
    if (setting === 'off') continue;
    if (typeof setting === 'string') {
      result.push({ ...issue, severity: setting });
      continue;
    }
    result.push(issue);
  }

  return result;
}

export function sizeOptionsFrom(config: LintConfig): SizeOptions {
  const setting = config.rules['OHPM-SIZE-05'];
  if (setting === undefined || typeof setting === 'string') return DEFAULT_SIZE_OPTIONS;

  return {
    warnMb: setting.warnMb ?? DEFAULT_SIZE_OPTIONS.warnMb,
    strongMb: setting.strongMb ?? DEFAULT_SIZE_OPTIONS.strongMb
  };
}

export function listConfiguredOff(config: LintConfig): string[] {
  return Object.entries(config.rules)
    .filter(([, value]) => value === 'off')
    .map(([rule]) => rule);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
