import { crc32, deflateSync } from 'node:zlib';

/**
 * A real PNG, drawn here rather than committed: a diagonal gradient in the
 * given colour, so every upload in a run is a fresh, decodable picture.
 *
 * The backend decodes and re-encodes what it is sent and refuses anything too
 * small, so this is a genuine image of a sensible size, not a 1x1 stub.
 */
export function gradientPng(
  width = 800,
  height = 600,
  tint: [number, number, number] = [59, 36, 24],
): Buffer {
  const rowLength = width * 3 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * rowLength;
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const shade = (x + y) / (width + height);
      const at = row + 1 + x * 3;
      raw[at] = Math.round(tint[0] + (255 - tint[0]) * shade);
      raw[at + 1] = Math.round(tint[1] + (255 - tint[1]) * shade);
      raw[at + 2] = Math.round(tint[2] + (255 - tint[2]) * shade);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([length, body, crc]);
}
