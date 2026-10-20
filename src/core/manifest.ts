import fs from 'node:fs';
import path from 'node:path';
import JSON5 from 'json5';

export interface ManifestLoad {
  exists: boolean;
  raw: string | null;
  parsed: Record<string, unknown> | null;
  error: string | null;
}

export function loadManifest(packageDir: string): ManifestLoad {
  const abs = path.join(packageDir, 'oh-package.json5');

  if (!fs.existsSync(abs)) {
    return { exists: false, raw: null, parsed: null, error: null };
  }

  let raw = '';
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch (error) {
    return { exists: true, raw: null, parsed: null, error: errorMessage(error) };
  }

  try {
    const parsed: unknown = JSON5.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { exists: true, raw, parsed: null, error: 'oh-package.json5 must be a JSON5 object' };
    }
    return { exists: true, raw, parsed: parsed as Record<string, unknown>, error: null };
  } catch (error) {
    return { exists: true, raw, parsed: null, error: errorMessage(error) };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
