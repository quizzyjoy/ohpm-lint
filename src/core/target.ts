import fs from 'node:fs';
import path from 'node:path';
import { unpackHar } from './unpack.js';
import type { TargetKind } from './types.js';

export interface Target {
  kind: TargetKind;
  inputPath: string;
  /** har: unpacked root; dir: the module directory */
  root: string;
  /** Size of the archive on disk (null for directory inputs) */
  archiveBytes: number | null;
  cleanup: () => void;
}

/**
 * Resolve the CLI argument into a lint target.
 * - file (.har/.tgz)            -> unpack, kind = har
 * - dir containing `package/`   -> treat as an unpacked har, kind = har
 * - dir (module root)           -> kind = dir
 */
export function resolveTarget(input: string): Target {
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) {
    throw new Error(`Path not found: ${abs}`);
  }

  const stat = fs.statSync(abs);

  if (stat.isFile()) {
    const unpacked = unpackHar(fs.readFileSync(abs));
    return {
      kind: 'har',
      inputPath: abs,
      root: unpacked.root,
      archiveBytes: stat.size,
      cleanup: unpacked.cleanup
    };
  }

  if (stat.isDirectory()) {
    if (fs.existsSync(path.join(abs, 'package'))) {
      return { kind: 'har', inputPath: abs, root: abs, archiveBytes: null, cleanup: () => {} };
    }
    return { kind: 'dir', inputPath: abs, root: abs, archiveBytes: null, cleanup: () => {} };
  }

  throw new Error(`Unsupported target: ${abs}`);
}
