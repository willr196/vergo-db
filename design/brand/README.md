# Brand assets

`vergo-mark-master.png` is the master V mark: 1254x1254, gold on black, lossless.
Nothing in the apps points at this file. It is kept so every derivative below
can be rebuilt from one source rather than from a copy of a copy, and it is the
file to upload anywhere that does its own resizing (Instagram, for one).

The current cut (3 Oct 2026) replaced the first one. The generator delivered it
inside a black disc with a grey rim on a grey-green square; the rim and the
square were faded to black from r=505 to r=552 around the disc's centre
(627,580). The gold stops at r=493, so nothing of the mark was touched. If a
new upload arrives framed like that, do the same before saving it here.

Everything else is generated from it with `node design/brand/build-mark.js`
(from the repo root):

| Derivative | Where | Built as |
| --- | --- | --- |
| `apps/api/public/images/vergo-mark.jpg` | og:image, structured data | 1200px JPEG, quality 88 |
| `apps/api/public/images/vergo-mark-600.webp`, `-400.webp` | homepage hero | WebP, quality 85 |
| `apps/api/public/images/vergo-mark-72.png` | the mark in the site header | 72px, 256-colour PNG |
| `apps/api/public/images/og/*.jpg` | per-page share cards | 80px disc painted over the top-left mark; not Halloween's, which is a photo |
| `apps/api/public/apple-touch-icon.png` | iOS home screen | 180px, 256-colour PNG |
| `apps/api/public/favicon.ico` | browser tab | 16/32/48 PNGs in one .ico |
| `apps/api/public/logo.png` | legacy URL, kept alive | 512px, 256-colour PNG |
| `apps/mobile/assets/icon.png` | app launcher icon | 1024px, 256-colour PNG |
| `apps/mobile/assets/adaptive-icon.png` | Android adaptive icon | 512px, 256-colour PNG |
| `apps/mobile/assets/splash-icon.png` | app splash | 512px, 256-colour PNG |
| `apps/mobile/assets/favicon.png` | Expo web favicon | 48px PNG |

The mark is gold on black with a lot of gradient texture, which a 24-bit PNG
cannot compress: the 1024 icon would be well over 1MB. Reduced to a 256-colour
palette (no dithering) it is about 330KB, with no visible difference. Keep that
in mind if you change how any of them are built.

The site serves the favicon, touch icon, `logo.png` and `images/vergo-mark*`
with `Cache-Control: no-cache` (see the static handler in
`apps/api/src/index.ts`), so replacing them in place is enough. The OG cards
are cached for a week like other images, and social sites keep their own copy
until the page is re-scraped.

If the mark ever exists as a vector, rebuild these from it instead. Every PNG
here would drop to a few KB.
