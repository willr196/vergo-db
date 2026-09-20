# Brand assets

`vergo-mark-master.png` is the master V mark: 1254x1254, straight from the
generator, uncompressed. Nothing in the apps points at this file. It is kept
so every derivative below can be rebuilt from one source rather than from a
copy of a copy, and it is the file to upload anywhere that does its own
resizing (Instagram, for one).

Everything else is generated from it:

| Derivative | Where | Built as |
| --- | --- | --- |
| `apps/api/public/images/vergo-mark.jpg` | og:image, structured data | 1200px JPEG, quality 0.88 |
| `apps/api/public/images/vergo-mark.webp` | spare, for a `<picture>` | 1200px WebP, quality 0.85 |
| `apps/api/public/images/icons/icon-*.png` | web manifest, 8 sizes | 256-colour PNG |
| `apps/api/public/images/vergo-mark-72.png` | the mark in the site header | 72px, 256-colour PNG (same bytes as `icon-72x72.png`) |
| `apps/api/public/apple-touch-icon.png` | iOS home screen | 180px, 256-colour PNG |
| `apps/api/public/favicon.ico` | browser tab | 16/32/48 PNGs in one .ico |
| `apps/api/public/logo.png`, `logo-small.png` | legacy URLs, kept alive | 512 / 256, 256-colour PNG |
| `apps/mobile/assets/icon.png` | app launcher icon | 1024px, 256-colour PNG |
| `apps/mobile/assets/adaptive-icon.png` | Android adaptive icon | 512px, 256-colour PNG |
| `apps/mobile/assets/splash-icon.png` | app splash | 512px, 256-colour PNG |

The mark is gold on black with a lot of gradient texture, which a 24-bit PNG
cannot compress: the 1024 icon was 1.5MB before it was reduced to a 256-colour
palette, and 168KB after, with no visible difference. Keep that in mind if you
regenerate any of them.

If the mark ever exists as a vector, rebuild these from it instead. Every PNG
here would drop to a few KB.
