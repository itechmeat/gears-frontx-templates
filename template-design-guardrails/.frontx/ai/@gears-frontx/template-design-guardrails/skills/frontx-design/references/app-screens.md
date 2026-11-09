# Application screens

How to apply the application-screen gates. The rule text, severity and waiver
level of each gate live in `rules/quality-gates.json`; this file
says what each one means on a FrontX screen and how to check it.

An application screen is a work surface: the user comes to find, compare,
decide and act. Every choice below serves scanning and action, not
impression.

## APP-001: colour on data, not chrome

- Chrome is everything that frames the work: menu, header, page title,
  toolbars, panels, card frames, table headers. It stays on neutral kit
  surface, border and foreground tokens.
- Colour goes where it carries meaning: status of a row, a severity, a chart
  series, a selected item, the one primary action of a region.
- Check: list every non-neutral token the screen uses and what it sits on.
  An accent or status token on a frame, a heading or a toolbar background is
  a finding.

## APP-002: a KPI is typography

- A KPI is an installed kit type role, a label, a unit or basis, and a delta
  or status when it means something (the KPI anatomy in
  `references/data.md`). Use the kit's KPI role where the installed kit has
  one (`kpi` and `kpi-lg` under `typography` in `DESIGN.md`, since kit
  0.5.0); on a kit without one the value takes the display or heading role.
- No decorative icon tile, gradient, tinted card or oversized illustration
  around the number. Hierarchy comes from the type role and position.
- Check: the value's computed font size and weight resolve to one kit type
  role's tokens; nothing behind it but the kit card surface.

## APP-003: flat surfaces from kit tokens

- Surfaces use the kit's card, popover, border and elevation tokens. One
  surface level per region; a card inside a card is a smell to justify.
- No gradients, glass or blur effects, stacked shadows or custom radii.
- Check: every `background`, `box-shadow`, `border` and `border-radius` in the
  screen's CSS Modules resolves to a kit token (SYS-002).

## APP-004: every component state

- Each interactive component shows the states from its family in
  `rules/component-state-matrix.json` that it can reach on this screen:
  the global states plus the family's own (loading on a button that starts
  pending work, invalid on a field, empty on a combobox). Link-only states
  such as visited-link apply to navigation links, never to buttons.
- Use the kit variant for each state; do not restyle one.
- Check: exercise hover, focus-visible, active and disabled on each control
  family once, and each family state the screen can reach. A state not
  reached is unverified.

## APP-005: desktop, tablet and phone

Every screen has a checked layout at three widths, plus the 320 CSS px reflow
floor (LAY-002):

| Width | Device | What changes |
|---|---|---|
| 1440 CSS px | desktop | Full layout: side-by-side regions, full tables, inspector panels open beside the content. |
| 768 CSS px | tablet | Secondary regions collapse or move below the primary one; tables drop or merge low-value columns; toolbars wrap by design, not by accident. |
| 390 CSS px | phone | The menu is a 56 px rail beside the screen. One column; the primary action stays reachable; tables become lists or scroll inside their own region; inspectors become a separate sub-route or a sheet. |

- Declare the transformation of each region before building it (LAY-001).
  Shrinking everything uniformly is not a transformation.
- Controls keep their kit size at every width; touch targets meet A11Y-002.
- Check: run the browser check (`references/verify.md`); its default widths
  are these three and 320 CSS px, in both themes. Look at the closing
  screenshots and report each width as observed or unverified.

## Related gates

Every application screen also answers the state-completeness gates
(`references/state-completeness.md`), the system gates SYS-001 to SYS-005 and
the layout gates LAY-001 to LAY-005.
