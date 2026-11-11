# Design

Poller looks like an engineering notebook on warm paper.

- **Canvas**: obsidian `#14141c` (dark, default) or rose-white `#fffcfc`
  (light), paper-grain noise over everything, hairline borders, crop-mark
  ticks at section corners.
- **Shape**: square corners everywhere. Buttons are solid accent blocks with a
  4 px hard shadow that lift on hover and press flat.
- **Logo**: POLLER set in Impacted (Harrison Reilly, free font), with its
  worn P in a solid accent block as the mark and the favicon. The font file
  holds only those letters.
- **Type**: Archivo (display 750 / heading 700), Instrument Serif italic for
  the emotional half of a headline, Geist for body, Geist Mono for uppercase
  labels.
- **Colour**: every page load draws one accent palette (rose, lavender, sky
  or coral, each with a darker ink for light mode). Rose quartz `#f5c0c0`
  is the default. Jade means live/success, citrine means closed/warning. Neutrals are
  tinted from the accent, never plain gray.
- **Components** live in `styles/app.css` under `@layer components`:
  `frame`, `rule`, `crop`, `eyebrow`, `display-1`, `heading-2/3`, `lead`,
  `btn` (`-primary`, `-secondary`, `-quiet`), `win` + `win-bar` (window
  cards), `hatch`, `tag[data-status]`, `notice`, form controls (`input`,
  `select`, `textarea`, `choice`, `rating`), results (`bars`, `bar-row`,
  `stats`), `table`.

## Mobile

- 16 px form text (no iOS zoom on focus); every control is at least 44 px tall.
- Whole choice rows are tap targets; ratings are a five-cell grid.
- At ≤ 560 px, sections use 20 px gutters, button groups stack full width,
  editor rows go single-column, stats stay in one compact row, and wide
  tables scroll inside their frame instead of the page.
- `prefers-reduced-motion` turns off button lifts and bar transitions.

## Motion

Everything moves like ink. The logo stamps down once per visit, page titles
press up from their baseline, picking a choice floods the row from the left,
results pour into their bars, a live vote jolts its row, and notices print
in. Reduced motion swaps all of it for fades and colour flashes.
