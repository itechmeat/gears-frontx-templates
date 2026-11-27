import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MetricCard } from './cards/MetricCard';
import type { WidgetRenderer } from './lifecycle';
import { ACTIVITY_FEED_SAMPLE, PROGRESS_LIST_CARD_SAMPLE, RANKED_LIST_CARD_SAMPLE } from './samples';
import type { WidgetTexts } from './states';

/*
 * The host-set empty text: every data widget bundle, drawn through its own renderer, shows the payload's
 * `empty_text` in its empty state in place of "No data to show".
 */

const renderers = import.meta.glob<WidgetRenderer>('../bundles/*/lifecycle.tsx', { eager: true, import: 'render' });
const sources = import.meta.glob<{ schemas?: { $id?: unknown; allOf?: { $ref?: unknown }[] }[] }>('../bundles/*/mfe.json', { eager: true, import: 'default' });
const DATA_WIDGET = 'gts://gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.data_widget.v1~';
const bundleOf = (file: string) => file.match(/bundles\/([^/]+)\//)![1];

/** The bundles whose widget type derives from data_widget, read from their own mfe.json. */
const dataWidgetBundles = Object.entries(sources)
  .filter(([, source]) => (source.schemas ?? []).some((type) => String(type.$id).startsWith(`${DATA_WIDGET}`) && type.allOf?.some((part) => part.$ref === DATA_WIDGET)))
  .map(([file]) => bundleOf(file))
  .sort();

/** One payload per data widget bundle whose data meets the widget's empty condition. */
const EMPTY: Record<string, { render: object; data: object }> = {
  metric_card: { render: {}, data: { value: null } },
  summary_card: { render: {}, data: { rows: [] } },
  ranked_list_card: { render: RANKED_LIST_CARD_SAMPLE.render, data: { rows: [] } },
  progress_list_card: { render: PROGRESS_LIST_CARD_SAMPLE.render, data: { rows: [] } },
  radial_progress: { render: {}, data: { current: null, target: 10 } },
  grid: { render: { columns: [{ key: 'name', title: 'Name' }] }, data: { rows: [] } },
  cartesian_chart: { render: {}, data: { series: [] } },
  pie_chart: { render: {}, data: { slices: [] } },
  radar_chart: { render: {}, data: { points: ['Mon', 'Tue', 'Wed'].map((axis) => ({ axis, series: null, value: null })) } },
  treemap_chart: { render: {}, data: { items: [{ label: 'a', value: 0, group: null }] } },
  waterfall_chart: { render: {}, data: { steps: [{ label: 'a', value: null }, { label: 'b', value: null }] } },
  activity_feed: { render: ACTIVITY_FEED_SAMPLE.render, data: { items: [] } },
  funnel_chart: { render: {}, data: { stages: [{ label: 'a', value: null }] } },
  heatmap: { render: {}, data: { rows: [] } },
};

const drawOf = (bundle: string) => renderers[`../bundles/${bundle}/lifecycle.tsx`];
const TEXT = 'Nothing for this period yet.';

describe('the host-set empty text', () => {
  it('has an empty payload for each of the 14 data widget bundles, and for no other bundle', () => {
    expect(dataWidgetBundles).toHaveLength(14);
    expect(Object.keys(EMPTY).sort()).toEqual(dataWidgetBundles);
    expect(dataWidgetBundles).not.toContain('markdown_card');
  });

  it.each(dataWidgetBundles)('of %s shows the payload empty_text in place of its own text, its own text without one or with one of nothing visible', (bundle) => {
    const draw = drawOf(bundle);
    const context = { locale: 'en', container: null };
    const first = render(<>{draw({ ...EMPTY[bundle], empty_text: TEXT } as never, context)}</>);
    expect(screen.getByText(TEXT)).toBeTruthy();
    expect(screen.queryByText('No data to show')).toBeNull();
    first.unmount();
    for (const payload of [EMPTY[bundle], { ...EMPTY[bundle], empty_text: '   ' }, { ...EMPTY[bundle], empty_text: '\u200B' }]) {
      const view = render(<>{draw(payload as never, context)}</>);
      expect(screen.getByText('No data to show')).toBeTruthy();
      expect(screen.queryByText(TEXT)).toBeNull();
      view.unmount();
    }
  });

  it('adds no key to the exported widget texts: texts a host writes out in full, key by key, type-check', () => {
    // Written out without a spread, so a new required key in WidgetTexts fails the type check here.
    const full: WidgetTexts = {
      empty: 'Leer',
      cannotBeShown: 'x',
      showData: 'x',
      showChart: 'x',
      dataOf: (title) => title,
      rowMeaning: { success: 'x', warning: 'x', error: 'x', info: 'x' },
      chart: 'x',
      table: 'x',
      columns: { series: 'x', x: 'x', y: 'x', label: 'x', value: 'x', size: 'x' },
      trend: { up: 'x', down: 'x', flat: 'x' },
      ranked: { value: 'x', secondary: 'x' },
      progress: { of: 'x', goal: 'x', goalOutside: 'x' },
      radial: { name: 'x', of: 'x', goal: 'x', overTarget: 'x', goalOutside: 'x' },
      metric: { reference: 'x', difference: (reference) => reference },
      pie: { total: 'x' },
      funnel: { conversion: 'x', ofPrevious: 'x' },
      radar: { axis: 'x' },
      treemap: { group: 'x', share: 'x', other: 'x', ofTotal: 'x' },
      waterfall: { change: 'x', running: 'x', increase: 'x', decrease: 'x', total: 'x' },
      feed: { name: 'x', showMore: 'x', tone: { neutral: 'x', success: 'x', warning: 'x', danger: 'x', info: 'x' } },
      link: { newTab: 'x' },
      grid: { search: 'x', noMatch: 'x', sparkline: () => 'x' },
    };
    render(<MetricCard payload={{ render: { null_value: 'dash' }, data: { value: null } }} texts={full} />);
    expect(screen.getByText('Leer')).toBeTruthy();
  });
});

describe('a null metric with null_value dash', () => {
  const data = { value: null, previous_value: 4, reference_value: 6, sparkline: [1, 3, 2] };
  const render_ = { value_label: 'Open incidents', reference_label: 'Last week', link: { text: 'All incidents', href: '/incidents' } };

  it('shows a dash headline named by the empty_text, with the caption, the sparkline and the link, and no trend or reference', () => {
    const { container } = render(<MetricCard payload={{ render: { ...render_, null_value: 'dash' }, data, empty_text: TEXT }} />);
    const headline = container.querySelector('strong')!;
    const dash = within(headline).getByText('-');
    expect(dash.getAttribute('aria-hidden')).toBe('true');
    expect(headline.textContent).toBe(`-${TEXT}`);
    expect(screen.getByText('Open incidents')).toBeTruthy();
    expect(container.querySelector('.recharts-area-curve')).not.toBeNull();
    expect(screen.getByRole('link', { name: /All incidents/ })).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText(/Last week/)).toBeNull();
    expect(screen.queryByText(/Difference/)).toBeNull();
    expect(screen.queryByText('No data to show')).toBeNull();
  });

  it.each([undefined, '  '])('names the dash "No data to show" with the empty_text %j', (emptyText) => {
    const { container } = render(<MetricCard payload={{ render: { null_value: 'dash' }, data: { value: null }, ...(emptyText === undefined ? {} : { empty_text: emptyText }) }} />);
    expect(container.querySelector('strong')!.textContent).toBe('-No data to show');
  });

  it('draws no unit word beside the dash', () => {
    const { container } = render(<MetricCard payload={{ render: { null_value: 'dash' }, data: { value: null }, value_format: { value_type: 'number', unit_label: 'lines' } }} />);
    expect(container.querySelector('strong')!.textContent).toBe('-No data to show');
  });

  it.each([{}, { null_value: 'empty' as const }])('shows the empty state for a null value with the render %j', (extra) => {
    const { container } = render(<MetricCard payload={{ render: { ...render_, ...extra }, data, empty_text: TEXT }} />);
    expect(screen.getByText(TEXT)).toBeTruthy();
    expect(container.querySelector('strong')).toBeNull();
    expect(screen.queryByText('Open incidents')).toBeNull();
  });

  it('shows a number with its trend under null_value dash', () => {
    const { container } = render(<MetricCard payload={{ render: { null_value: 'dash' }, data: { value: 5, previous_value: 4 } }} />);
    expect(container.querySelector('strong')!.textContent).toBe('5');
    expect(screen.getByRole('img', { name: 'Up' })).toBeTruthy();
  });
});
