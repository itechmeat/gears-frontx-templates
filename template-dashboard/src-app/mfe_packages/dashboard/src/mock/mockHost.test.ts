import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ServedFile } from '../contract';
import { createMockHost, DEMO_SERVED_FILE } from './mockHost';

/*
 * The mock host's served file when the widget bundles come from a served list:
 * the demo file followed by every listed part, read on each request.
 */

const partOf = (widget: string): ServedFile => ({
  types: [{ $id: `gts.frontx.dashboard.widget.widget.v1~frontx.dashboard.widget.${widget}.v1~` }],
  instances: [{ id: `gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.dashboard.mfe.${widget}.v1` }],
});

function stubWidgetList(parts: ServedFile[]) {
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/widgets.json')) {
      return Promise.resolve(new Response(JSON.stringify(parts.map((_, index) => `bundle_${index}/widget.gts.json`)), { status: 200 }));
    }
    const index = Number(url.match(/bundle_(\d+)\/widget\.gts\.json$/)?.[1]);
    return Promise.resolve(new Response(JSON.stringify(parts[index]), { status: 200 }));
  });
}

/** The expected median, for an odd or an even count. */
const medianOf = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the mock host', () => {
  it('answers loadFile with the demo file followed by the listed widget parts', async () => {
    const parts = [partOf('metric_card'), partOf('grid')];
    stubWidgetList(parts);
    const host = createMockHost({ delayMs: 0, widgetList: '/widgets/widgets.json' });
    expect(await host.loadFile(new AbortController().signal)).toEqual([DEMO_SERVED_FILE, ...parts]);
  });

  it('answers loadFile with the demo file itself and fetches nothing without a widget list', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const host = createMockHost({ delayMs: 0 });
    const file = await host.loadFile(new AbortController().signal);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(file).toEqual(DEMO_SERVED_FILE);
  });

  it('returns a file that is not {types, instances} unchanged and reads no list', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const broken = { broken: true };
    await expect(createMockHost({ delayMs: 0, file: broken, widgetList: '/widgets/widgets.json' }).loadFile(new AbortController().signal)).resolves.toEqual(broken);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('appends the listed widget parts to a file that is already a list, and returns an empty list unchanged', async () => {
    const parts = [partOf('metric_card'), partOf('grid')];
    stubWidgetList(parts);
    const own = partOf('pie_chart');
    expect(await createMockHost({ delayMs: 0, file: [DEMO_SERVED_FILE, own], widgetList: '/widgets/widgets.json' }).loadFile(new AbortController().signal)).toEqual([DEMO_SERVED_FILE, own, ...parts]);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await createMockHost({ delayMs: 0, file: [], widgetList: '/widgets/widgets.json' }).loadFile(new AbortController().signal)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads the widget list again on each dashboard request', async () => {
    stubWidgetList([partOf('metric_card')]);
    const lists = vi.spyOn(globalThis, 'fetch');
    const host = createMockHost({ delayMs: 0, widgetList: '/widgets/widgets.json' });
    await host.loadFile(new AbortController().signal);
    await host.loadFile(new AbortController().signal);
    expect(lists.mock.calls.filter(([input]) => String(input).endsWith('/widgets.json'))).toHaveLength(2);
  });

  it('answers the period demo requests with numbers that change with the period, and the 30-day numbers without one', async () => {
    const host = createMockHost({ delayMs: 0 });
    const passed = async (path: string) => ((await host.request({ method: 'GET', path }, new AbortController().signal)) as { passed: number }).passed;
    const [week, month, quarter, none] = await Promise.all(['?period=7d', '?period=30d', '?period=90d', ''].map((query) => passed(`/api/demo/ci/outcomes${query}`)));
    expect(week).toBeLessThan(month);
    expect(quarter).toBeGreaterThan(month);
    expect(none).toBe(month);
  });

  it('answers the calendar request with one row per day over five months, a few days left out', async () => {
    const host = createMockHost({ delayMs: 0 });
    const { days } = (await host.request({ method: 'GET', path: '/api/demo/commits/calendar' }, new AbortController().signal)) as { days: { day: string; commits: number }[] };
    expect(days[0].day).toBe('2026-06-08');
    expect(days.at(-1)!.day).toBe('2026-11-04');
    // 150 days, of which 3 have no row.
    expect(days).toHaveLength(147);
    expect(days.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day) && Number.isInteger(row.commits) && row.commits >= 0)).toBe(true);
    expect(new Set(days.map((row) => row.day)).size).toBe(days.length);
  });

  it('answers CI runs per day by outcome for 14 days, one day with no run', async () => {
    const host = createMockHost({ delayMs: 0 });
    const { daily } = (await host.request({ method: 'GET', path: '/api/demo/ci/daily' }, new AbortController().signal)) as { daily: { day: string; passed: number; failed: number; cancelled: number }[] };
    expect(daily).toHaveLength(14);
    expect(daily.at(-1)!.day).toBe('2026-11-04');
    expect(daily.filter((row) => row.passed + row.failed + row.cancelled === 0).map((row) => row.day)).toEqual(['2026-11-01']);
    expect(daily.every((row) => [row.passed, row.failed, row.cancelled].every((count) => Number.isInteger(count) && count >= 0))).toBe(true);
  });

  it('answers the summary with the count and median age of the pull requests the open pull requests request lists', async () => {
    const host = createMockHost({ delayMs: 0 });
    const ask = (path: string) => host.request({ method: 'GET', path }, new AbortController().signal);
    const [summary, open] = (await Promise.all([ask('/api/demo/delivery/summary'), ask('/api/demo/pulls/open')])) as [
      { open_prs: { value: number; median_age_days: number } },
      { pulls: { age_days: number }[] },
    ];
    expect(summary.open_prs.value).toBe(open.pulls.length);
    expect(summary.open_prs.median_age_days).toBe(medianOf(open.pulls.map((pull) => pull.age_days)));
  });

  type Pair = { value: number; previous: number };
  type DailyKey = 'commits' | 'prs_opened' | 'prs_merged' | 'deploys';
  type Daily = { daily: Record<DailyKey, number>[] };
  const askDemo = (path: string) => createMockHost({ delayMs: 0 }).request({ method: 'GET', path }, new AbortController().signal);
  const total = ({ daily }: Daily, from: number, to: number | undefined, key: DailyKey) =>
    daily.slice(from, to).reduce((sum, row) => sum + row[key], 0);

  it('answers the summary with 7-day counts that are the sums of the last 7 daily rows, and previous ones of the 7 before', async () => {
    const [summary, daily] = (await Promise.all([askDemo('/api/demo/delivery/summary'), askDemo('/api/demo/delivery/daily')])) as [Record<DailyKey, Pair>, Daily];
    for (const key of ['commits', 'prs_opened', 'prs_merged', 'deploys'] as const) {
      expect(summary[key].value).toBe(total(daily, -7, undefined, key));
      expect(summary[key].previous).toBe(total(daily, -14, -7, key));
    }
  });

  it('answers the change failure rate as the whole failed deploys over the deploys, now and in the 7 days before', async () => {
    const { deploys, change_failure_rate: rate } = (await askDemo('/api/demo/delivery/summary')) as { deploys: Pair; change_failure_rate: Pair & { failed_deploys: number; previous_failed_deploys: number } };
    expect(Number.isInteger(rate.failed_deploys) && Number.isInteger(rate.previous_failed_deploys)).toBe(true);
    expect(rate.failed_deploys).toBeLessThanOrEqual(deploys.value);
    expect(rate.previous_failed_deploys).toBeLessThanOrEqual(deploys.previous);
    expect(rate.value).toBe(rate.failed_deploys / deploys.value);
    expect(rate.previous).toBe(rate.previous_failed_deploys / deploys.previous);
  });

  it('answers the funnel with the opened and merged pull requests of the last 30 daily rows, reviewed and approved at the thirds between them', async () => {
    const [funnel, daily] = (await Promise.all([askDemo('/api/demo/delivery/funnel'), askDemo('/api/demo/delivery/daily')])) as [{ opened: number; reviewed: number; approved: number; merged: number }, Daily];
    expect(funnel.opened).toBe(total(daily, -30, undefined, 'prs_opened'));
    expect(funnel.merged).toBe(total(daily, -30, undefined, 'prs_merged'));
    // Reviewed and approved split the gap between opened and merged in thirds (rounded).
    const third = (funnel.opened - funnel.merged) / 3;
    expect(funnel.opened).toBeGreaterThan(funnel.merged);
    expect(funnel.reviewed).toBe(funnel.merged + Math.round(2 * third));
    expect(funnel.approved).toBe(funnel.merged + Math.round(third));
    const stages = [funnel.opened, funnel.reviewed, funnel.approved, funnel.merged];
    expect(stages.every((count, index) => Number.isInteger(count) && (index === 0 || count <= stages[index - 1]))).toBe(true);
  });

  it('answers the weekday and hour heatmap with cells that add up to the commits of the daily rows', async () => {
    const [{ cells }, daily] = (await Promise.all([askDemo('/api/demo/commits/heatmap'), askDemo('/api/demo/delivery/daily')])) as [{ cells: { count: number }[] }, Daily];
    const cellTotal = cells.reduce((sum, cell) => sum + cell.count, 0);
    // Each cell is rounded to a whole count, so the total is off by at most half a commit per cell.
    expect(Math.abs(cellTotal - total(daily, 0, undefined, 'commits'))).toBeLessThanOrEqual(cells.length / 2);
  });

  it('answers the median review time as the median of the review times the repository activity request lists', async () => {
    const [{ review_h }, activity] = (await Promise.all([askDemo('/api/demo/delivery/summary'), askDemo('/api/demo/repos/activity')])) as [{ review_h: { value: number } }, { review_h: number }[]];
    expect(review_h.value).toBe(medianOf(activity.map((row) => row.review_h)));
  });

  it('answers repository health with a state or null, a coverage share from 0 to 1, and 14 daily counts with one gap', async () => {
    const host = createMockHost({ delayMs: 0 });
    const { repos } = (await host.request({ method: 'GET', path: '/api/demo/repos/health' }, new AbortController().signal)) as {
      repos: { repo: string; state: string | null; coverage: number; daily: (number | null)[] }[];
    };
    expect(repos).toHaveLength(12);
    expect(repos.every((row) => row.coverage >= 0 && row.coverage <= 1 && row.daily.length === 14)).toBe(true);
    expect(repos.filter((row) => row.state === null)).toHaveLength(1);
    expect(repos.flatMap((row) => row.daily).filter((count) => count === null)).toHaveLength(1);
  });

  it('is exported from the ./mock subpath and not from the package root', async () => {
    // Cold imports through the package's own specifiers, as a product writes them.
    const root = await import('@gears-frontx/frontx-dashboard-root');
    for (const name of ['createMockHost', 'DEMO_SERVED_FILE', 'DEMO_DASHBOARD_ID']) expect(Object.keys(root)).not.toContain(name);
    const mock = await import('@gears-frontx/frontx-dashboard-root/mock');
    expect(typeof mock.createMockHost).toBe('function');
    // The cold import of the whole root takes over 30 s when the full suite runs in parallel.
  }, 60_000);
});
