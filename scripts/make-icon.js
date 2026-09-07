// Generates build/icon.png (1024x1024) with no dependencies: a rounded gradient tile with a play
// glyph and a 9:16 "phone" cut-out. electron-builder converts it to .ico / .icns at build time.
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const SIZE = 1024
const px = Buffer.alloc(SIZE * SIZE * 4)

function lerp(a, b, t) {
  return a + (b - a) * t
}
function put(x, y, r, g, b, a) {
  const i = (y * SIZE + x) * 4
  const oa = px[i + 3] / 255
  const na = a / 255
  const outA = na + oa * (1 - na)
  if (outA === 0) return
  px[i] = Math.round((r * na + px[i] * oa * (1 - na)) / outA)
  px[i + 1] = Math.round((g * na + px[i + 1] * oa * (1 - na)) / outA)
  px[i + 2] = Math.round((b * na + px[i + 2] * oa * (1 - na)) / outA)
  px[i + 3] = Math.round(outA * 255)
}
function roundedRect(cx, cy, w, h, radius, x, y) {
  const dx = Math.max(Math.abs(x - cx) - w / 2 + radius, 0)
  const dy = Math.max(Math.abs(y - cy) - h / 2 + radius, 0)
  return Math.sqrt(dx * dx + dy * dy) - radius // signed distance
}
function coverage(d) {
  return Math.max(0, Math.min(1, 0.5 - d)) // 1px anti-aliasing
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    // background tile: gradient #ff2d55 -> #7c5cff
    const t = (x + y) / (2 * SIZE)
    const c = coverage(roundedRect(512, 512, 900, 900, 200, x, y))
    if (c > 0) put(x, y, lerp(255, 124, t), lerp(45, 92, t), lerp(85, 255, t), c * 255)
    // phone frame (9:16) in white, semi transparent
    const frame = coverage(roundedRect(512, 512, 380, 676, 56, x, y)) - coverage(roundedRect(512, 512, 330, 626, 40, x, y))
    if (frame > 0) put(x, y, 255, 255, 255, frame * 235)
    // play triangle
    const tx = (x - 470) / 150
    const ty = (y - 512) / 120
    const inside = tx >= 0 && tx <= 1 && Math.abs(ty) <= 1 - tx
    const edge = Math.min(tx, 1 - tx - Math.abs(ty)) * 150
    if (inside) put(x, y, 255, 255, 255, Math.min(1, edge) * 255)
    // "part" bar at the bottom of the phone
    const bar = coverage(roundedRect(512, 780, 200, 26, 13, x, y))
    if (bar > 0) put(x, y, 255, 255, 255, bar * 200)
  }
}

// PNG encoding
function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])
const out = path.join(__dirname, '..', 'build', 'icon.png')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, png)
console.log('wrote', out, `${(png.length / 1024).toFixed(0)} KB`)
