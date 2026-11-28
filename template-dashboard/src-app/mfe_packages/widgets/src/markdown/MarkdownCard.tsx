import { useMemo } from 'react';
import { VisuallyHidden } from '@gears-frontx/ui-kit';
import type { RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root/contract';

import { DEFAULT_WIDGET_TEXTS, type WidgetTexts } from '../states';
import { TONE_MARKS } from '../tones';
import type { MarkdownCardRender } from '../types';
import styles from '../widgets.module.css';
import { renderMarkdown } from './markdownModel';

/**
 * The `markdown_card` widget: its markdown `body`, rendered as CommonMark by markdown-it with raw
 * HTML off, and the link and image safety of cpt-frontx-dashboard-algo-widget-catalog-markdown
 * applied in markdown-it's renderer rules. It is not a data widget: it takes no data, shows no data
 * states, and sends no request. The cell's `label`, `locale` and `container` are accepted like every
 * widget takes them, but the body is its own text and carries its own names, so the card uses none
 * of them. Of the `texts` it uses only the names of the shared tones, for a toned card.
 *
 * A toned card (any tone but neutral) draws a soft surface and a leading icon in its tone, the icon
 * hidden from assistive technology, and puts the tone's name as visually hidden text before the body,
 * so a screen reader reads it first in reading order. The name and the icon sit outside the element
 * that holds the rendered markdown. The card takes no live role: it is static, so it announces
 * nothing on mount. The body keeps the text colour in every tone.
 */
export function MarkdownCard({
  payload,
  texts = DEFAULT_WIDGET_TEXTS,
}: {
  payload: RenderWidgetPayload<MarkdownCardRender>;
  locale?: string;
  texts?: WidgetTexts;
  label?: string;
  container?: HTMLElement | ShadowRoot | null;
}) {
  const { body, heading_style: headingStyle, text_width: textWidth, tone } = payload.render;
  const html = useMemo(() => renderMarkdown(body), [body]);
  const className = [styles.markdown, headingStyle === 'section' ? styles.markdownSection : '', textWidth === 'reading' ? styles.markdownReading : ''].filter(Boolean).join(' ');
  const markdown = <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  const Mark = tone ? TONE_MARKS[tone] : undefined;
  if (!tone || !Mark) return markdown;
  return (
    <div className={`${styles.markdownTone} ${styles[`markdownTone-${tone}`]}`}>
      <span className={styles.markdownMark}>
        <Mark className={styles[`feedMark-${tone}`]} aria-hidden />
      </span>
      <VisuallyHidden>{texts.feed.tone[tone]}: </VisuallyHidden>
      {markdown}
    </div>
  );
}
