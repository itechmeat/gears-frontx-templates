import { act } from '@testing-library/react';
import type { ActionHandler, ChildMfeBridge } from '@gears-frontx/mfes';
import { LANGUAGE_PROPERTY_ID, RENDER_WIDGET_ACTION_ID, THEME_PROPERTY_ID, type RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root';
import { describe, expect, it } from 'vitest';

import { METRIC_CARD_SAMPLE, PROGRESS_LIST_CARD_SAMPLE, RANKED_LIST_CARD_SAMPLE, SUMMARY_CARD_SAMPLE } from './cards/samples';
import { entryIdOf, WIDGET_ENTRIES } from './entries';
import { HEATMAP_SAMPLE } from './heatmap/samples';
import { MARKDOWN_CARD_SAMPLE } from './markdown/samples';

// Each catalog entry id mounts the widget of its own type: the widget draws a payload of that type.
const CASES: [string, RenderWidgetPayload, string][] = [
  ['metric_card', METRIC_CARD_SAMPLE as RenderWidgetPayload, '[class*="metric"]'],
  ['summary_card', SUMMARY_CARD_SAMPLE as RenderWidgetPayload, 'dl'],
  ['ranked_list_card', RANKED_LIST_CARD_SAMPLE as RenderWidgetPayload, 'ol'],
  ['progress_list_card', PROGRESS_LIST_CARD_SAMPLE as RenderWidgetPayload, '[role="progressbar"]'],
  ['heatmap', HEATMAP_SAMPLE as RenderWidgetPayload, '[class*="heat"]'],
  ['markdown_card', MARKDOWN_CARD_SAMPLE as unknown as RenderWidgetPayload, '[class*="markdown"]'],
  ['pie_chart', { render: {}, data: { slices: [{ label: 'a', value: 1 }] } } as RenderWidgetPayload, '.recharts-pie'],
  ['cartesian_chart', { render: { series: [{ name: 'a', type: 'bar' }] }, data: { series: [{ name: 'a', points: [{ x: 'x', y: 1 }] }] } } as RenderWidgetPayload, '.recharts-bar'],
  ['grid', { render: { columns: [{ key: 'a', title: 'A' }] }, data: { rows: [['one']] } } as RenderWidgetPayload, 'table'],
];

function bridge() {
  const handlers = new Map<string, ActionHandler>();
  const values: Record<string, string> = { [THEME_PROPERTY_ID]: 'light', [LANGUAGE_PROPERTY_ID]: 'en' };
  const child = {
    registerActionHandler: (type: string, handler: ActionHandler) => handlers.set(type, handler),
    getProperty: (id: string) => ({ id, value: values[id] }),
    subscribeToProperty: () => () => undefined,
  } as unknown as ChildMfeBridge;
  return { child, handlers };
}

describe('the catalog entries', () => {
  it('names one entry per catalog type', () => {
    expect(Object.keys(WIDGET_ENTRIES).sort()).toEqual(CASES.map(([type]) => entryIdOf(type)).sort());
  });

  it.each(CASES)('mounts the %s widget for its entry', async (type, payload, selector) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const lifecycle = WIDGET_ENTRIES[entryIdOf(type)]();
    const { child, handlers } = bridge();
    await act(async () => lifecycle.mount(shadow, child));
    await act(async () => handlers.get(RENDER_WIDGET_ACTION_ID)!.handleAction(RENDER_WIDGET_ACTION_ID, payload as unknown as Record<string, unknown>));
    expect(shadow.querySelector(selector)).not.toBeNull();
    expect(shadow.textContent).not.toContain('This widget cannot be shown');
    await act(async () => lifecycle.unmount(shadow));
    host.remove();
  });
});
