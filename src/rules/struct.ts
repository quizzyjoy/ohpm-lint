import fs from 'node:fs';
import { displayPath } from '../core/files.js';
import type { Issue, LintContext } from '../core/types.js';

export function structRules(ctx: LintContext): Issue[] {
  const issues: Issue[] = [];

  // ---- STRUCT-01 package/ 目录 ----
  if (ctx.kind === 'har' && !fs.existsSync(ctx.packageDir)) {
    issues.push({
      rule: 'OHPM-STRUCT-01',
      severity: 'error',
      title: '缺少 package/ 目录',
      message: 'HAR 根目录下没有 package/ 目录（官方要求 oh-package.json5 位于 package/ 下）',
      path: 'package/',
      hint: '用 DevEco / hvigor 正常构建 HAR，不要手工重打包或压平目录层级。',
      officialRef: '§7.1'
    });
  }

  // ---- STRUCT-02 JSON5 可解析 ----
  if (ctx.manifestError !== null) {
    issues.push({
      rule: 'OHPM-STRUCT-02',
      severity: 'error',
      title: 'oh-package.json5 不是合法 JSON5',
      message: ctx.manifestError,
      path: displayPath(ctx, 'oh-package.json5'),
      hint: '检查引号、逗号与注释；可用 JSON5 校验器先过一遍。',
      officialRef: '§7.1'
    });
  }

  // ---- STRUCT-03 .so 必须位于 libs/ ----
  if (ctx.kind === 'har') {
    const misplaced = ctx.files.filter((file) => /\.so$/i.test(file.path) && !/^libs\//i.test(file.path));
    if (misplaced.length > 0) {
      issues.push({
        rule: 'OHPM-STRUCT-03',
        severity: 'error',
        title: '.so 文件不在 package/libs/ 下',
        message: `发现 ${misplaced.length} 个位置错误的 .so：${misplaced.slice(0, 5).map((f) => f.path).join(', ')}`,
        hint: '把 native 库统一放到 package/libs/ 下，并在 nativeComponents 中声明。',
        officialRef: '§7.1'
      });
    }
  }

  return issues;
}
