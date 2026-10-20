/**
 * ArkTS reserved keywords.
 * Kept conservative on purpose: only language keywords (JS + strict mode + TS + `struct`),
 * not decorator names — a package called `@foo/state` must not be flagged.
 */
export const ARKTS_KEYWORDS: ReadonlySet<string> = new Set([
  // JS
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import',
  'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true',
  'try', 'typeof', 'var', 'void', 'while', 'with',
  // strict mode
  'implements', 'interface', 'let', 'package', 'private', 'protected', 'public', 'static', 'yield',
  // TS
  'abstract', 'as', 'async', 'await', 'boolean', 'constructor', 'declare', 'from', 'get', 'infer',
  'is', 'keyof', 'module', 'namespace', 'never', 'number', 'object', 'of', 'readonly', 'require',
  'set', 'string', 'symbol', 'type', 'undefined', 'unique', 'unknown',
  // ArkTS / ArkUI
  'struct'
]);
