Special Events artwork and photography.

Everything in this folder is **original illustration drawn for the page**, not
photography. Nothing here is a real VERGO event. It exists so the page reads as
finished before a shoot happens, and all of it is meant to be replaced.

## What ships today

Hand-drawn SVG, black / VERGO gold / Halloween orange, no stock imagery and no
licensing to worry about. Each concept card gets its own scene:

- `concept-haunted-hotel.svg` — corridor, numbered doors, one ajar with light
  spilling out and a figure in it
- `concept-outbreak.svg` — containment lighting, a figure behind plastic
  sheeting, hazard tape
- `concept-vampire-ball.svg` — chandelier and candles, arched windows, two
  raised coupes
- `concept-twisted-circus.svg` — big top, pennant, string of bulbs, ringmaster
  silhouette
- `concept-seance.svg` — round table, three candles, planchette, hands at the
  edge of frame
- `halloween-makeup-placeholder.svg` — lit makeup mirror, used in the makeup
  section
- `halloween-hero-cast.svg` — the hero backdrop. Nine silhouettes backlit under
  a moon: bellboy, waiter with a tray, ringmaster, gown, hooded figure,
  bartender. Deliberately a mix of hospitality and performers.
- `vergo-pumpkin.svg` — **the VERGO pumpkin.** A jack-o'-lantern carved with
  the brand V instead of a face. Used three ways, all from this one file: large
  and glowing in the hero, as the header and footer brand mark on these pages,
  and as the divider ornament above the final CTA. Keep it as the one Halloween
  motif — the page stays premium because it is used at size and sparingly, not
  scattered about.

This one is **not** a placeholder. It is brand artwork and should survive a
photography shoot.

## Expected filenames, once there is photography

- `halloween-hero.webp` — full-bleed hero backdrop, landscape, ~2400px wide.
  Dark, cinematic, room for the headline over the left half.
- `halloween-makeup.webp` — makeup section, 21:9 crop, ~1680px wide.
- `halloween-haunted-hotel.webp` — the feature card, ~1800px wide
- `halloween-outbreak.webp`
- `halloween-vampire-ball.webp`
- `halloween-twisted-circus.webp`
- `halloween-seance.webp`

The four smaller concept images are 16:9 crops, ~1200px wide.

## Shooting notes

The page is black, VERGO gold (`#d4af37`) and Halloween orange (`#ed7a33`).
Warm, low-key lighting cuts with it; cold blue or green grades fight it. Leave
the hero shot dark through the left half so the headline stays readable, and
expect a scrim over it either way. The SVGs above double as a shot list — each
one is roughly the frame worth shooting for real.

## How to swap something in

Every image area is a CSS custom property, so each swap is one line.

**Hero** — in `/pages/css/special-events.css`, `.se-hero`:

```css
--se-hero-img: url('/images/special-events/halloween-hero.webp');
```

**A concept card** — inline on the `.se-concept` element in
`/special-events/halloween.html`. The `--se-c1` / `--se-c2` tint values stay as
the fallback if the file ever goes missing:

```html
<article class="se-concept" style="--se-c1: #2d1318; --se-c2: #0a0708; --se-concept-img: url(&quot;/images/special-events/halloween-vampire-ball.webp&quot;)">
```

**Makeup** — it is a real `<img>`, so swap the `src` and rewrite the `alt` to
describe the actual photograph.
