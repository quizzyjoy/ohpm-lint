import { charLength, displayPath } from '../core/files.js';
import type { Issue, LintContext } from '../core/types.js';
import { ARKTS_KEYWORDS } from './arkts-keywords.js';

const FORBIDDEN_SUFFIXES = ['.tar.gz', '.har', '.tar', '.tgz'];
const SCOPE_CHARS = /^[a-z0-9_-]+$/;
const BODY_CHARS = /^[a-z0-9._-]+$/;

export function nameRules(ctx: LintContext): Issue[] {
  const manifest = ctx.manifest;
  if (manifest === null) return [];

  const name = typeof manifest['name'] === 'string' ? manifest['name'] : '';
  const path = displayPath(ctx, 'oh-package.json5');
  const issues: Issue[] = [];

  if (name.trim() === '') {
    return [
      make('OHPM-NAME-01', 'error', 'name 缺失', 'oh-package.json5 必须包含 name 字段', '填写 @组织/包名 形式的包名。', path)
    ];
  }

  // ---- NAME-02 长度 ----
  const length = charLength(name);
  if (length < 1 || length > 128) {
    issues.push(make('OHPM-NAME-02', 'error', 'name 长度不合规', `当前 ${length} 字符，官方要求 1–128`, '缩短包名。', path));
  }

  // ---- NAME-01 scope 语法 ----
  const atCount = (name.match(/@/g) ?? []).length;
  const slashCount = (name.match(/\//g) ?? []).length;

  if (atCount > 1) {
    issues.push(make('OHPM-NAME-01', 'error', 'name 中 @ 过多', `name 中只能出现一个 @（当前 ${atCount} 个）`, '改为 @组织/包名。', path));
  }
  if (slashCount > 1) {
    issues.push(make('OHPM-NAME-01', 'error', 'name 中 / 过多', `name 中只能出现一个 /（当前 ${slashCount} 个）`, '改为 @组织/包名。', path));
  }

  let body = name;
  if (name.startsWith('@')) {
    if (slashCount !== 1) {
      issues.push(make('OHPM-NAME-01', 'error', '带 scope 的 name 必须含 /', '形如 @组织/包名', '补上组织名或去掉 @。', path));
    } else {
      const [scope = '', rest = ''] = name.slice(1).split('/');
      body = rest;

      const scopeLength = charLength(scope);
      if (scopeLength < 1 || scopeLength > 36) {
        issues.push(make('OHPM-NAME-01', 'error', 'scope 长度不合规', `@${scope} 长度为 ${scopeLength}，上限 36`, '缩短组织名。', path));
      }
      if (!SCOPE_CHARS.test(scope)) {
        issues.push(
          make('OHPM-NAME-01', 'error', 'scope 含非法字符', `"${scope}" 只允许小写字母、数字、- 和 _`, '把组织名改为小写（官方不允许大写）。', path)
        );
      } else if (!/^[a-z]/.test(scope)) {
        issues.push(make('OHPM-NAME-01', 'error', 'scope 未以小写字母开头', `"${scope}"`, '组织名需以小写字母开头。', path));
      }
      if (/[-_]$/.test(scope)) {
        issues.push(make('OHPM-NAME-01', 'error', 'scope 以分隔符结尾', `"${scope}"`, '去掉末尾的 - 或 _。', path));
      }
      if (ARKTS_KEYWORDS.has(scope)) {
        issues.push(make('OHPM-NAME-05', 'error', 'scope 是 ArkTS 保留字', `"${scope}" 不能作为组织名`, '换一个组织名。', path));
      }
    }
  } else if (slashCount > 0) {
    issues.push(make('OHPM-NAME-01', 'error', '无 scope 的 name 不能含 /', `"${name}"`, '要么补 @组织，要么去掉 /。', path));
  }

  // ---- NAME-03 包名主体 ----
  if (body !== '') {
    if (!BODY_CHARS.test(body)) {
      issues.push(
        make('OHPM-NAME-03', 'error', '包名含非法字符', `"${body}" 只允许小写字母、数字、. - _`, '把大写/特殊字符改成小写字母或分隔符。', path)
      );
    } else if (!/^[a-z]/.test(body)) {
      issues.push(make('OHPM-NAME-03', 'error', '包名未以小写字母开头', `"${body}"`, '包名需以小写字母开头。', path));
    }
    if (/[._-]$/.test(body)) {
      issues.push(make('OHPM-NAME-03', 'error', '包名以分隔符结尾', `"${body}"`, '去掉末尾的 . - _。', path));
    }
    if (ARKTS_KEYWORDS.has(body)) {
      issues.push(make('OHPM-NAME-05', 'error', '包名是 ArkTS 保留字', `"${body}" 不能作为包名`, '换一个包名。', path));
    }
  }

  // ---- NAME-04 禁止后缀 ----
  const lower = name.toLowerCase();
  const badSuffix = FORBIDDEN_SUFFIXES.find((suffix) => lower.endsWith(suffix));
  if (badSuffix !== undefined) {
    issues.push(make('OHPM-NAME-04', 'error', 'name 使用了禁止后缀', `name 不能以 ${badSuffix} 结尾`, '去掉归档文件后缀，只保留包名。', path));
  }

  return issues;
}

function make(
  rule: string,
  severity: Issue['severity'],
  title: string,
  message: string,
  hint: string,
  path: string
): Issue {
  return { rule, severity, title, message, hint, officialRef: '§2', path };
}
