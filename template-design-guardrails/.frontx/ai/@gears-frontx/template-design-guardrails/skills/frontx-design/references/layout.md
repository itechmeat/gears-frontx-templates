# Layout and responsive behavior

The numbers (spacing scale, fallback grid, regions, responsive order) are in
`rules/layout-contract.json`; this file says how to use them.

## Spacing

- The kit's `--space-*` tokens are the scale: 4 px base, 8 px primary
  rhythm. The only steps are `spacingScalePx`; larger region gaps compose
  from them (LAY-004).
- 4 px is for optical correction, icon proximity and dense gaps inside a
  component; page and pattern structure uses multiples of 8 px.
- Bands: 4 to 8 px inside a compact control, 8 to 16 px between related
  fields or row content, 16 to 24 px between pattern groups, 24 to 32 px
  between page regions.
- A box that draws its own edge (a card, a bordered or shadowed row) pads
  every side it draws: 4 px floor, 12 to 24 px normal. Content never sits
  flush against a drawn edge. The one exemption is a full-bleed media card;
  its non-media content is still padded (LAY-005).
- Spacing comes from CSS Module rules on `--space-*` tokens (SYS-004). Check
  it in the render, not by reading class names.
- No negative margins to fix structural alignment; no adjacent gaps that
  differ by 1 to 3 px unless they correct a recorded optical offset.

## Regions and alignment

- Define the regions before placing cards: shell, primary navigation,
  optional context navigation, page header and actions, toolbar or filters,
  main task surface, optional inspector, footer or pagination.
- One parent owns each divider, border and inset; adjacent children never
  draw doubled borders.
- Title, toolbar, content and footer share one content inset (LAY-003).
- Repeated items share column starts, baselines and action alignment, and
  labels and values do not drift between cards of one family (LAY-005).
- Icons align to the optical centre of the control; text aligns to text
  baselines. A selection marker never changes row geometry.
- Numeric columns use tabular numerals and right alignment when comparison
  is the job.

## Grid and widths

- Use the host grid when it exists, otherwise `fallbackGrid`. Its values
  are starting points: a breakpoint goes where content fails, not where a
  device name says.
- An ordered group of blocks whose widths follow size classes (small,
  medium, large) takes the kit's `Grid` and `GridItem`; exact spans, manual
  placement and page regions stay on `fallbackGrid` with CSS Modules.
- Two reusable spans, full and half (dashboard rules in `references/data.md`).
- Forms keep a readable width instead of stretching fields across the
  viewport; prose measure is in `references/typography.md`.

## Responsive transformation

Declare at least three content-driven states per region (LAY-001); uniform
scaling is not a transformation. On a FrontX screen the checked widths and
the shell's menu rail are in `references/app-screens.md` (APP-005).

| Region | Wide | Medium | Narrow |
|---|---|---|---|
| Navigation | persistent | secondary navigation collapses or overlays first | one reading and action flow |
| Parallel regions | side by side where comparison helps | low-value columns go before the primary entity narrows | stacked in decision order |
| Inspector | may stay open beside the content | overlays | full-height layer or its own route |
| Actions | visible | tertiary actions move to a labelled overflow menu; job and primary action stay visible | sticky positioning goes when it hides focused or readable content |
| Table | full | low-value columns removed | a compact list when the table cannot reflow, otherwise table semantics with local horizontal scroll |

## Overflow

- No horizontal scroll of the page, or of the box the shell scrolls the page
  in, at 320 CSS px, except truly two-dimensional content such as a data
  grid or timeline (LAY-002). Content scrolling inside its own box is
  measured at that box's visible content area, and the box keeps its own
  padding.
- Actions and statuses are never clipped. Menus, dialogs, popovers and
  tooltips stay inside the viewport and reachable at zoom.
- Loading reserves the final geometry so nothing shifts on arrival (STA-005).

## Density acceptance

Equal controls have equal heights; repeated rows keep one rhythm; the icon
to label gap is 8 px unless the kit sets another. Targets meet A11Y-002; 40
to 44 px for primary touch controls where the density allows. Pressure is
never solved by shrinking body text, swapping labels for ambiguous icons or
shrinking targets.

## Reject

Regions on unrelated insets; equal widgets with different anatomy; blank
cards to balance a grid; a desktop layout scaled down; a responsive state
that changes the reading order without changing DOM and keyboard order; a
floating panel over the focused control; every card inventing its own
padding.
