import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readTar } from './tar.js';

export interface Unpacked {
  root: string;
  cleanup: () => void;
}

/** Unpack a .har (gzip + tar) into a temp directory. */
export function unpackHar(buffer: Buffer): Unpacked {
  const tarBuffer = isGzip(buffer) ? gunzipSync(buffer) : buffer;
  const entries = readTar(tarBuffer);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpm-lint-'));

  for (const entry of entries) {
    const target = safeJoin(root, entry.path);
    if (target === null) continue;

    if (entry.type === 'dir') {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.data ?? Buffer.alloc(0));
  }

  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true })
  };
}

function isGzip(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

/** Join and refuse absolute paths / `..` escapes. */
function safeJoin(root: string, relative: string): string | null {
  const cleaned = relative.replace(/^[/\\]+/, '');
  if (cleaned === '') return null;
  if (cleaned.split(/[/\\]/).some((part) => part === '..')) return null;

  const resolved = path.resolve(root, cleaned);
  const prefix = path.resolve(root) + path.sep;
  return resolved.startsWith(prefix) ? resolved : null;
}
