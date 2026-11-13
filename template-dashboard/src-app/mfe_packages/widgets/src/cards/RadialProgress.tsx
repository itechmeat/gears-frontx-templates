import type { RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root/contract';

import { isCompact, useElementSize } from '../chart/CartesianChart';
import { formatValue, nonFiniteProblemOf } from '../format';
import { DEFAULT_WIDGET_TEXTS, WidgetCannotBeShown, WidgetEmpty, type WidgetTexts } from '../states';
import type { RadialProgressData, RadialProgressRender } from '../types';
import styles from '../widgets.module.css';

// The ring is drawn in a square of the cell's shorter side; before the first measurement (and in a test document,
// which measures nothing) it is drawn as in a square of this side.
const FALLBACK_SIDE = 200;
// The ring's width as a share of its outer radius, within a floor and a ceiling in pixels, and the room the goal tick
// reaches past the ring on each side.
const RING_SHARE = 0.18;
const RING_MIN = 6;
const RING_MAX = 20;
const TICK_OVERHANG = 3;
// About the width of one character and the height of one line for their font size, and the share of the hole's radius
// the centre text may reach: the text block's corners stay inside that circle.
const CHAR_WIDTH = 0.62;
const LINE_HEIGHT = 1.2;
const HOLE_ROOM = 0.9;
// The centre text sizes: the main number, the second line of `both`, the caption; smaller than the floor, a line is left out.
const MAIN_SIZE = 32;
const SECOND_SIZE = 14;
const CAPTION_SIZE = 12;
const FLOOR_SIZE = 9;

/** A share of the ring, 0 to 100, rounded to hundredths: never beyond either end, and 100 for a share that overflows. */
const clampShare = (share: number) => Math.max(0, Math.min(100, Math.round(share * 100) / 100));

interface Line {
  text: string;
  size: number;
  className: string;
}

/**
 * The centre lines that fit the hole: the whole text block scaled down by one factor until its corners are inside it,
 * never above each line's own size. When a line would then fall under the readable floor, the last line is left out
 * (the caption first, then the second line) and the rest is sized again; the text alternative still says everything.
 */
function centreLinesOf(hole: number, main: string, second: string, caption: string): Line[] {
  const room = hole * HOLE_ROOM;
  let lines: Line[] = [
    { text: main, size: MAIN_SIZE, className: styles.radialMain },
    { text: second, size: SECOND_SIZE, className: styles.radialSecond },
    { text: caption, size: CAPTION_SIZE, className: styles.radialCaption },
  ].filter((line) => line.text !== '');
  while (lines.length > 0) {
    const width = Math.max(...lines.map((line) => line.text.length * CHAR_WIDTH * line.size));
    const height = lines.reduce((total, line) => total + line.size * LINE_HEIGHT, 0);
    const scale = Math.min(1, room / Math.hypot(width / 2, height / 2));
    const sized = lines.map((line) => ({ ...line, size: line.size * scale }));
    if (sized.every((line) => line.size >= FLOOR_SIZE)) return sized;
    lines = lines.slice(0, -1);
  }
  return [];
}

/** The ring's own check of its data: the problem, or null. A null `current` or `target` is no problem: the ring is empty. */
export function checkRadialProgress(data: RadialProgressData): string | null {
  if (data.target !== null && data.target <= 0) return 'radial_progress: data.target is not above 0';
  if (data.current !== null && data.current < 0) return 'radial_progress: data.current is below 0';
  return null;
}

/**
 * The `radial_progress` widget: one ring filling by `current` over `target`, full when `current` reaches or exceeds
 * `target`, with the percent, the value or both in its hole and an optional goal tick. It is a progress bar for
 * assistive technology: named by the cell's label, its value text says the percent, the current and target values,
 * whether the current value is over the target, and the goal.
 */
export function RadialProgress({
  payload,
  locale = 'en',
  texts = DEFAULT_WIDGET_TEXTS,
  label,
}: {
  payload: RenderWidgetPayload<RadialProgressRender, RadialProgressData>;
  locale?: string;
  texts?: WidgetTexts;
  label?: string;
  container?: HTMLElement | ShadowRoot | null;
}) {
  const { render, data, value_format } = payload;
  const [measure, { width, height }] = useElementSize();
  if (!data) return <WidgetCannotBeShown texts={texts} problem="radial_progress: no data" />;
  const nonFinite = nonFiniteProblemOf('radial_progress', payload);
  if (nonFinite) return <WidgetCannotBeShown texts={texts} problem={nonFinite} />;
  const problem = checkRadialProgress(data);
  if (problem) return <WidgetCannotBeShown texts={texts} problem={problem} />;
  // A ring with no current value or no target has nothing to fill, as a data type's empty condition.
  if (data.current === null || data.target === null) return <WidgetEmpty texts={texts} />;

  const { current, target } = data;
  // Both finite, `target` above 0: the ratio is finite or, beyond the largest number, an infinity the text leaves out.
  const ratio = current / target;
  const filled = clampShare(ratio * 100);
  const over = current > target;
  // A percent below the target never rounds up to 100%.
  const percent = formatValue(Math.floor(ratio * 100) / 100, { value_type: 'percent', decimals: 0 }, locale);
  const value = formatValue(current, value_format, locale);
  const goal = typeof data.goal === 'number' ? { value: data.goal, share: (data.goal / target) * 100 } : null;
  const goalAt = goal && clampShare(goal.share);
  const goalOutside = goal !== null && (goal.share < 0 || goal.share > 100);
  const goalText = goal ? `${render.goal_label ?? texts.radial.goal}: ${formatValue(goal.value, value_format, locale)}${goalOutside ? `, ${texts.radial.goalOutside}` : ''}` : '';
  const valueText = [percent, `${value} ${texts.radial.of} ${formatValue(target, value_format, locale)}`, over ? texts.radial.overTarget : '', goalText].filter(Boolean).join(', ');

  const display = render.display ?? 'percent';
  const main = display === 'value' ? value : percent || value;
  const second = display === 'both' && main === percent ? value : '';
  // In a low cell the caption is left out, so the numbers keep the hole.
  const caption = isCompact(height) ? '' : (render.center_label ?? '');

  const side = Math.min(width, height) || FALLBACK_SIDE;
  const centre = side / 2;
  const outer = centre - TICK_OVERHANG - 1;
  const ring = Math.max(RING_MIN, Math.min(RING_MAX, outer * RING_SHARE));
  const hole = outer - ring;
  const lines = centreLinesOf(hole, main, second, caption);
  const block = lines.reduce((total, line) => total + line.size * LINE_HEIGHT, 0);
  // The goal tick crosses the ring, clockwise from the top; a goal outside the ring stands at its nearer end.
  const tick = goalAt === null ? null : ((goalAt / 100) * 2 - 0.5) * Math.PI;
  const at = (radius: number, angle: number) => ({ x: centre + radius * Math.cos(angle), y: centre + radius * Math.sin(angle) });

  return (
    <div
      ref={measure}
      className={styles.radial}
      role="progressbar"
      aria-label={label ?? texts.radial.name}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={filled}
      aria-valuetext={valueText}
      title={goalText || undefined}
    >
      <svg className={styles.radialRing} viewBox={`0 0 ${side} ${side}`} aria-hidden>
        <circle className={styles.radialTrack} cx={centre} cy={centre} r={outer - ring / 2} strokeWidth={ring} />
        {/* The fill runs clockwise from the top over the share of a ring of path length 100. */}
        <circle
          className={styles.radialFill}
          cx={centre}
          cy={centre}
          r={outer - ring / 2}
          strokeWidth={ring}
          pathLength={100}
          strokeDasharray={`${filled} 100`}
          transform={`rotate(-90 ${centre} ${centre})`}
        />
        {tick === null ? null : (
          <line className={styles.radialGoal} x1={at(hole - TICK_OVERHANG, tick).x} y1={at(hole - TICK_OVERHANG, tick).y} x2={at(outer + TICK_OVERHANG, tick).x} y2={at(outer + TICK_OVERHANG, tick).y} />
        )}
        {lines.map((line, index) => {
          const before = lines.slice(0, index).reduce((total, item) => total + item.size * LINE_HEIGHT, 0);
          return (
            <text key={index} className={line.className} x={centre} y={centre - block / 2 + before + (line.size * LINE_HEIGHT) / 2} textAnchor="middle" dominantBaseline="central" fontSize={line.size}>
              {line.text}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
