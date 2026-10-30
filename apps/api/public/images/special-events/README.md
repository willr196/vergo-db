Special Events artwork and photography.

Everything in this folder is **original illustration drawn for the page**, not
photography. Nothing here is a real VERGO event. It exists so the page reads as
finished before a shoot happens, and all of it is meant to be replaced.

## What ships today

Hand-drawn SVG, no stock imagery and no licensing to worry about.

- `christmas-bar.svg`, `christmas-canapes.svg`, `christmas-santa.svg` — the
  three styling examples under the hero on `/special-events/christmas`.
- `concept-santas-grotto.svg`, `concept-toy-factory.svg`,
  `concept-winter-wonderland.svg`, `concept-victorian-christmas.svg` — one
  scene per concept card.
- `vergo-christmas-tree.svg` — **the VERGO tree.** The brand V strung in
  lights. Used three ways, all from this one file: in the hero, as the header
  brand mark on the Christmas page, and as the divider ornament above the
  final CTA.

The tree is **not** a placeholder. It is brand artwork and should survive a
photography shoot.

## How to swap something in

Every image area is a CSS custom property, so each swap is one line.

**Hero** — in `/pages/css/special-events.css`, `body.se-theme-christmas .se-hero`:

```css
--se-hero-img: url('/images/special-events/christmas-hero.webp');
```

**A concept card** — inline on the `.se-concept` element in
`views/pages/special-events/christmas.eta`. The `--se-c1` / `--se-c2` tint
values stay as the fallback if the file ever goes missing:

```html
<article class="se-concept" style="--se-c1: #6b1620; --se-c2: #1a0709; --se-concept-img: url(&quot;/images/special-events/christmas-grotto.webp&quot;)">
```

**Styling examples** — real `<img>` tags, so swap the `src` and rewrite the
`alt` to describe the actual photograph.
