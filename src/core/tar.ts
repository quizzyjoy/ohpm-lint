/**
 * Minimal USTAR reader/writer — enough for `.har` (gzip + tar) without extra deps.
 * Supports: regular files, directories, GNU long name ('L'), PAX extended header ('x'/'g').
 */

export interface TarEntry {
  path: string;
  type: 'file' | 'dir';
  data?: Buffer;
}

const BLOCK = 512;

function isZeroBlock(buf: Buffer): boolean {
  for (let i = 0; i < BLOCK; i++) {
    if (buf[i] !== 0) return false;
  }
  return true;
}

function readString(buf: Buffer, start: number, len: number): string {
  const slice = buf.subarray(start, start + len);
  const end = slice.indexOf(0);
  return (end === -1 ? slice : slice.subarray(0, end)).toString('utf8');
}

function readOctal(buf: Buffer, start: number, len: number): number {
  const raw = buf.subarray(start, start + len);
  if (raw[0] === 0x80) {
    let value = 0;
    for (let i = 1; i < raw.length; i++) value = value * 256 + (raw[i] ?? 0);
    return value;
  }
  const text = raw.toString('ascii').replace(/\0[\s\S]*$/, '').trim();
  if (text === '') return 0;
  const value = parseInt(text, 8);
  return Number.isFinite(value) ? value : 0;
}

function parsePax(payload: string): { path?: string; size?: number } {
  const out: { path?: string; size?: number } = {};
  let rest = payload;
  while (rest.length > 0) {
    const space = rest.indexOf(' ');
    if (space === -1) break;
    const len = parseInt(rest.slice(0, space), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const record = rest.slice(space + 1, len - 1); // strip trailing \n
    rest = rest.slice(len);
    const eq = record.indexOf('=');
    if (eq === -1) continue;
    const key = record.slice(0, eq);
    const value = record.slice(eq + 1);
    if (key === 'path') out.path = value;
    if (key === 'size') {
      const n = parseInt(value, 10);
      if (Number.isFinite(n)) out.size = n;
    }
  }
  return out;
}

/** Parse a tar buffer into entries (files keep their bytes, dirs have none). */
export function readTar(buf: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let nextPath: string | undefined;
  let nextSize: number | undefined;

  while (offset + BLOCK <= buf.length) {
    const header = buf.subarray(offset, offset + BLOCK);
    if (isZeroBlock(header)) {
      offset += BLOCK;
      continue;
    }

    const nameField = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    let name = prefix === '' ? nameField : `${prefix}/${nameField}`;
    const typeflag = String.fromCharCode(header[156] ?? 0);
    const size = readOctal(header, 124, 12);
    const dataStart = offset + BLOCK;

    if (typeflag === 'x' || typeflag === 'g') {
      const pax = parsePax(buf.subarray(dataStart, dataStart + size).toString('utf8'));
      if (pax.path !== undefined) nextPath = pax.path;
      if (pax.size !== undefined) nextSize = pax.size;
      offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
      continue;
    }

    if (typeflag === 'L' || typeflag === 'K') {
      const value = readString(buf.subarray(dataStart, dataStart + size), 0, size);
      if (typeflag === 'L') nextPath = value;
      offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
      continue;
    }

    const finalName = nextPath ?? name;
    const finalSize = nextSize ?? size;
    nextPath = undefined;
    nextSize = undefined;

    if (finalName !== '') {
      if (typeflag === '5') {
        entries.push({ path: stripTrailingSlash(finalName), type: 'dir' });
      } else if (typeflag === '0' || typeflag === '\0' || typeflag === '7') {
        entries.push({
          path: stripTrailingSlash(finalName),
          type: 'file',
          data: buf.subarray(dataStart, dataStart + finalSize)
        });
      }
    }

    offset = dataStart + Math.ceil(finalSize / BLOCK) * BLOCK;
  }

  return entries;
}

function stripTrailingSlash(p: string): string {
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

/** Build a tar buffer from `{ path, data }` file records (used by fixtures/tests). */
export function packTar(files: Array<{ path: string; data: Buffer }>): Buffer {
  const chunks: Buffer[] = [];

  for (const file of files) {
    const header = Buffer.alloc(BLOCK, 0);
    let name = file.path;

    if (Buffer.byteLength(name) > 100) {
      const slash = name.lastIndexOf('/', 154);
      if (slash > 0) {
        header.write(name.slice(slash + 1), 0, 'utf8');
        header.write(name.slice(0, slash), 345, 'utf8');
        name = name.slice(slash + 1);
      } else {
        header.write(name.slice(0, 100), 0, 'utf8');
      }
    } else {
      header.write(name, 0, 'utf8');
    }

    header.write('0000644\0', 100, 'ascii');
    header.write('0000000\0', 108, 'ascii');
    header.write('0000000\0', 116, 'ascii');
    writeOctal(header, 124, 12, file.data.length);
    writeOctal(header, 136, 12, 0);
    header.write('0', 156, 'ascii');
    header.write('ustar\0', 257, 'ascii');
    header.write('00', 263, 'ascii');

    // checksum: spaces first, then the octal sum
    header.fill(0x20, 148, 156);
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) sum += header[i] ?? 0;
    header.write(sum.toString(8).padStart(6, '0'), 148, 'ascii');
    header.write('\0 ', 154, 'ascii');

    chunks.push(header, file.data);
    const pad = (BLOCK - (file.data.length % BLOCK)) % BLOCK;
    if (pad > 0) chunks.push(Buffer.alloc(pad, 0));
  }

  chunks.push(Buffer.alloc(BLOCK * 2, 0));
  return Buffer.concat(chunks);
}

function writeOctal(buf: Buffer, start: number, len: number, value: number): void {
  const text = value.toString(8).padStart(len - 1, '0');
  buf.write(text.slice(0, len - 1), start, 'ascii');
  buf[start + len - 1] = 0;
}
