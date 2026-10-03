// Rebuilds every derivative of the V mark from vergo-mark-master.png.
// Run from the repo root: node design/brand/build-mark.js
// See README.md in this folder for what each file is and where it is used.
const path = require('path');
const fs = require('fs');
const sharp = require(require.resolve('sharp', { paths: [path.join(__dirname, '../../apps/api')] }));

const ROOT = path.join(__dirname, '../..');
const P = (p) => path.join(ROOT, p);

// No dithering: on this artwork it doubles the file size for nothing visible.
const pal = (img) => img.png({ palette: true, colours: 256, quality: 100, dither: 0, compressionLevel: 9, effort: 10 });

(async () => {
  // Read into memory: sharp keeps file handles open, and Windows then refuses
  // to let us write over the same file.
  const master = fs.readFileSync(P('design/brand/vergo-mark-master.png'));
  const at = (n) => sharp(master).resize(n, n, { kernel: 'lanczos3' });

  await at(1200).jpeg({ quality: 88, mozjpeg: true }).toFile(P('apps/api/public/images/vergo-mark.jpg'));
  await at(600).webp({ quality: 85 }).toFile(P('apps/api/public/images/vergo-mark-600.webp'));
  await at(400).webp({ quality: 85 }).toFile(P('apps/api/public/images/vergo-mark-400.webp'));
  await pal(at(72)).toFile(P('apps/api/public/images/vergo-mark-72.png'));
  await pal(at(512)).toFile(P('apps/api/public/logo.png'));
  await pal(at(180)).toFile(P('apps/api/public/apple-touch-icon.png'));
  await pal(at(1024)).toFile(P('apps/mobile/assets/icon.png'));
  await pal(at(512)).toFile(P('apps/mobile/assets/adaptive-icon.png'));
  await pal(at(512)).toFile(P('apps/mobile/assets/splash-icon.png'));
  await at(48).ensureAlpha().png({ compressionLevel: 9 }).toFile(P('apps/mobile/assets/favicon.png'));

  // favicon.ico: 16/32/48 RGBA PNGs packed into one ICO.
  const frames = [];
  for (const n of [16, 32, 48]) frames.push([n, await at(n).ensureAlpha().png({ compressionLevel: 9 }).toBuffer()]);
  const head = Buffer.alloc(6 + 16 * frames.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(frames.length, 4);
  let off = head.length;
  frames.forEach(([n, buf], k) => {
    const o = 6 + 16 * k;
    head[o] = n;
    head[o + 1] = n;
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(buf.length, o + 8);
    head.writeUInt32LE(off, o + 12);
    off += buf.length;
  });
  fs.writeFileSync(P('apps/api/public/favicon.ico'), Buffer.concat([head, ...frames.map((f) => f[1])]));

  // OG cards: each has the mark in a 76px disc at the top left. Paint an 80px
  // disc over it (covering the old one's antialiased edge), cropped to 124% the
  // way the site header does it so the V fills the circle. Halloween's card is
  // a photo with no mark. Each run re-encodes the cards, so run it when the
  // mark changes, not as a routine step.
  const W = (await sharp(master).metadata()).width;
  const D = 80, SS = 4, crop = Math.round(W / 1.24), c0 = Math.round((W - crop) / 2);
  const mask = Buffer.from(`<svg width="${D * SS}" height="${D * SS}"><circle cx="${D * SS / 2}" cy="${D * SS / 2}" r="${D * SS / 2}" fill="#fff"/></svg>`);
  const big = await sharp(master).extract({ left: c0, top: c0, width: crop, height: crop })
    .resize(D * SS, D * SS).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const disc = await sharp(big).resize(D, D, { kernel: 'lanczos3' }).png().toBuffer();
  const ogDir = P('apps/api/public/images/og');
  for (const f of fs.readdirSync(ogDir)) {
    if (f === 'halloween.jpg') continue;
    const file = path.join(ogDir, f);
    const out = await sharp(fs.readFileSync(file)).composite([{ input: disc, left: 62, top: 53 }])
      .jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    fs.writeFileSync(file, out);
  }
  console.log('Rebuilt every derivative from vergo-mark-master.png');
})();
