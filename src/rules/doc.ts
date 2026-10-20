import { displayPath, findTopLevel, isBlank, readText, README_NAMES } from '../core/files.js';
import type { Issue, LintContext } from '../core/types.js';

interface Section {
  label: string;
  test: RegExp;
  hint: string;
}

/** README 八要素（官方只在审核口径里"建议"，因此全部为 warn）。 */
const SECTIONS: Section[] = [
  { label: '安装', test: /(安装|install|快速开始|快速上手|使用方式)/i, hint: '加一节「安装」，含 ohpm install 命令。' },
  { label: '所需权限', test: /(权限|permission)/i, hint: '写清需要哪些系统权限；没有权限要求时也要显式写"无"。' },
  { label: '接口说明', test: /(接口|API|方法说明|属性说明|函数)/i, hint: '列出对外 API 的签名与参数含义。' },
  { label: '使用示例', test: /(示例|example|demo|用法)/i, hint: '给一段可直接复制的调用示例。' },
  { label: '约束与限制', test: /(约束|限制|兼容|支持.{0,8}(API|SDK)|最低版本)/i, hint: '写明最低兼容 API/SDK 版本与已知限制。' },
  { label: '目录结构', test: /(目录|文件结构|工程结构)/i, hint: '给出包内目录树，帮助使用者定位入口。' },
  { label: '贡献', test: /(贡献|contribut)/i, hint: '说明如何提 issue/PR。' },
  { label: '开源协议', test: /(许可|license|协议)/i, hint: '写明 license，并确认包根有 LICENSE 文件。' }
];

export function docRules(ctx: LintContext): Issue[] {
  const readme = findTopLevel(ctx.files, README_NAMES);
  if (readme === undefined) return [];

  const text = readText(ctx.packageDir, readme.path);
  if (isBlank(text)) return [];

  return SECTIONS.filter((section) => !section.test.test(text)).map((section) => ({
    rule: 'OHPM-DOC-01',
    severity: 'warn' as const,
    title: `README 缺少「${section.label}」相关说明`,
    message: `在 ${readme.path} 中没有找到「${section.label}」相关内容`,
    hint: section.hint,
    officialRef: '建议项',
    path: displayPath(ctx, readme.path)
  }));
}
