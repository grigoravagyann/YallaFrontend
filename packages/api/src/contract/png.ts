/**
 * A real PNG, made in memory, for the upload contracts.
 *
 * The backend sniffs the bytes and decodes them, so a Blob with an `image/png`
 * type and nothing behind it is refused — and a checked-in fixture would be
 * uploaded once and deduplicated on every later run, which is not the upload
 * the contract is about. Each call draws a different image from random bytes,
 * so each upload is genuinely new unless a test sends the same Blob twice on
 * purpose.
 *
 * No dependency: an 8-bit RGB image, one zlib stream of stored (uncompressed)
 * deflate blocks, and the two checksums the format needs.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typed = concat([new TextEncoder().encode(type), data]);
  return concat([uint32(data.length), typed, uint32(crc32(typed))]);
}

/** A zlib stream of stored deflate blocks: valid, if not small. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < raw.length || offset === 0; offset += 0xffff) {
    const piece = raw.subarray(offset, Math.min(raw.length, offset + 0xffff));
    const last = offset + 0xffff >= raw.length;
    const length = piece.length;
    blocks.push(
      new Uint8Array([
        last ? 1 : 0,
        length & 0xff,
        length >>> 8,
        ~length & 0xff,
        (~length >>> 8) & 0xff,
      ]),
      piece,
    );
    if (last) break;
  }
  blocks.push(uint32(adler32(raw)));
  return concat(blocks);
}

/** A `width` × `height` PNG no earlier call produced. */
export function pngBlob(width = 48, height = 32): Blob {
  const noise = new Uint8Array(width * height * 3);
  crypto.getRandomValues(noise);

  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    raw[row] = 0; // filter: none
    raw.set(noise.subarray(y * width * 3, (y + 1) * width * 3), row + 1);
  }

  const header = concat([uint32(width), uint32(height), new Uint8Array([8, 2, 0, 0, 0])]);
  const bytes = concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
  return new Blob([bytes], { type: 'image/png' });
}
