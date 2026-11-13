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

  type CiOutcomes = { passed: number; failed: number; cancelled: number; skipped: number };
  const OUTCOMES = ['passed', 'failed', 'cancelled', 'skipped'] as const;

  it('answers CI runs per day by outcome for the 31 daily days, one day with no run', async () => {
    const host = createMockHost({ delayMs: 0 });
    const { daily } = (await host.request({ method: 'GET', path: '/api/demo/ci/daily' }, new AbortController().signal)) as { daily: ({ day: string } & CiOutcomes)[] };
    expect(daily).toHaveLength(31);
    expect(daily[0].day).toBe('2026-10-05');
    expect(daily.at(-1)!.day).toBe('2026-11-04');
    expect(daily.filter((row) => OUTCOMES.every((key) => row[key] === 0)).map((row) => row.day)).toEqual(['2026-11-01']);
    expect(daily.every((row) => OUTCOMES.every((key) => Number.isInteger(row[key]) && row[key] >= 0))).toBe(true);
  });

  it('answers CI outcomes that add up to the per-day CI rows of the period: the last 7 or 30 of them', async () => {
    const host = createMockHost({ delayMs: 0 });
    const ask = (path: string) => host.request({ method: 'GET', path }, new AbortController().signal);
    const [week, month, { daily }] = (await Promise.all([ask('/api/demo/ci/outcomes?period=7d'), ask('/api/demo/ci/outcomes?period=30d'), ask('/api/demo/ci/daily')])) as [
      CiOutcomes,
      CiOutcomes,
      { daily: CiOutcomes[] },
    ];
    for (const [outcomes, days] of [[week, 7], [month, 30]] as const) {
      for (const key of OUTCOMES) expect(outcomes[key]).toBe(daily.slice(-days).reduce((sum, row) => sum + row[key], 0));
    }
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
  type Daily = { daily: (Record<DailyKey, number> & { day: string })[] };
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
    expect(cells.every((cell) => Number.isInteger(cell.count))).toBe(true);
    expect(cellTotal).toBe(total(daily, 0, undefined, 'commits'));
  });

  type Activity = { repo: string; commits: number; prs: number }[];
  type CalendarDays = { days: { day: string; commits: number }[] };
  const dayOf = ({ daily }: Daily, index: number) => daily.at(index)!.day;
  const totalOf = (rows: Activity, key: 'commits' | 'prs') => rows.reduce((sum, row) => sum + row[key], 0);

  it('answers repository commits that add up to the daily commits of the period: the last 7 or 30 daily rows, the last 90 calendar days', async () => {
    const [week, month, none, protoPeriod, constructorPeriod, quarter, daily, { days }] = (await Promise.all([
      askDemo('/api/demo/repos/activity?period=7d'),
      askDemo('/api/demo/repos/activity?period=30d'),
      askDemo('/api/demo/repos/activity'),
      askDemo('/api/demo/repos/activity?period=__proto__'),
      askDemo('/api/demo/repos/activity?period=constructor'),
      askDemo('/api/demo/repos/activity?period=90d'),
      askDemo('/api/demo/delivery/daily'),
      askDemo('/api/demo/commits/calendar'),
    ])) as [Activity, Activity, Activity, Activity, Activity, Activity, Daily, CalendarDays];
    expect(totalOf(week, 'commits')).toBe(total(daily, -7, undefined, 'commits'));
    expect(totalOf(month, 'commits')).toBe(total(daily, -30, undefined, 'commits'));
    // No period, or any value other than 7d, 30d and 90d (an Object key such as __proto__ too), is 30 days.
    for (const other of [none, protoPeriod, constructorPeriod]) expect(other).toEqual(month);
    // The 90 days run back from the last daily row; a day with no calendar row counts no commit.
    const last = new Date(`${dayOf(daily, -1)}T00:00:00Z`).getTime();
    const inQuarter = days.filter((row) => last - new Date(`${row.day}T00:00:00Z`).getTime() < 90 * 86_400_000);
    expect(totalOf(quarter, 'commits')).toBe(inQuarter.reduce((sum, row) => sum + row.commits, 0));
    // A readable ranking: whole counts, most commits first (the ranked list keeps the order it gets), no two repositories level.
    for (const rows of [week, month, quarter]) {
      const commits = rows.map((row) => row.commits);
      expect(rows.every((row) => Number.isInteger(row.commits) && Number.isInteger(row.prs))).toBe(true);
      expect(commits).toEqual([...commits].sort((a, b) => b - a));
      expect(new Set(commits).size).toBe(rows.length);
    }
  });

  it('answers repository pull requests that add up to the pull requests opened in the period: the funnel for 30 days, the daily rows for 7', async () => {
    const [week, month, funnel, daily] = (await Promise.all([
      askDemo('/api/demo/repos/activity?period=7d'),
      askDemo('/api/demo/repos/activity?period=30d'),
      askDemo('/api/demo/delivery/funnel'),
      askDemo('/api/demo/delivery/daily'),
    ])) as [Activity, Activity, { opened: number }, Daily];
    expect(totalOf(month, 'prs')).toBe(funnel.opened);
    expect(totalOf(week, 'prs')).toBe(total(daily, -7, undefined, 'prs_opened'));
  });

  it('answers open pull requests of each repository no more than that repository opened: in 30 days, and under 7 days old in 7 days', async () => {
    const [week, month, { pulls }] = (await Promise.all([
      askDemo('/api/demo/repos/activity?period=7d'),
      askDemo('/api/demo/repos/activity?period=30d'),
      askDemo('/api/demo/pulls/open'),
    ])) as [Activity, Activity, { pulls: { repo: string; age_days: number }[] }];
    const openOf = (repo: string, maxAge: number) => pulls.filter((pull) => pull.repo === repo && pull.age_days <= maxAge).length;
    // Every open pull request is younger than 30 days.
    expect(Math.max(...pulls.map((pull) => pull.age_days))).toBeLessThan(30);
    for (const { repo, prs } of month) expect(openOf(repo, 29)).toBeLessThanOrEqual(prs);
    for (const { repo, prs } of week) expect(openOf(repo, 6)).toBeLessThanOrEqual(prs);
  });

  it('answers repository health whose counts of each of the last 14 days add up to the commits of that daily row', async () => {
    const [{ repos }, daily] = (await Promise.all([askDemo('/api/demo/repos/health'), askDemo('/api/demo/delivery/daily')])) as [{ repos: { daily: (number | null)[] }[] }, Daily];
    const perDay = Array.from({ length: 14 }, (_, day) => repos.reduce((sum, row) => sum + (row.daily[day] ?? 0), 0));
    expect(perDay).toEqual(daily.daily.slice(-14).map((row) => row.commits));
    // The gap falls on a busy day, so the other repositories visibly carry the commits the gap repository did not report.
    const gapDay = repos.flatMap((row) => row.daily.map((count, day) => (count === null ? day : -1))).find((day) => day >= 0)!;
    expect(perDay[gapDay]).toBeGreaterThanOrEqual(medianOf(perDay));
  });

  it('answers the calendar with the commits of the daily rows on the days they share', async () => {
    const [{ days }, daily] = (await Promise.all([askDemo('/api/demo/commits/calendar'), askDemo('/api/demo/delivery/daily')])) as [CalendarDays, Daily];
    const calendar = new Map(days.map((row) => [row.day, row.commits]));
    expect(daily.daily.map((_, index) => calendar.get(dayOf(daily, index)))).toEqual(daily.daily.map((row) => row.commits));
  });

  it('answers open pull requests of each age no more than the pull requests opened on that day, the age counted back from the last daily row', async () => {
    const [{ pulls }, daily] = (await Promise.all([askDemo('/api/demo/pulls/open'), askDemo('/api/demo/delivery/daily')])) as [{ pulls: { age_days: number }[] }, Daily];
    const byAge = new Map<number, number>();
    for (const { age_days: age } of pulls) byAge.set(age, (byAge.get(age) ?? 0) + 1);
    for (const [age, open] of byAge) {
      expect(Number.isInteger(age) && age >= 0 && age < daily.daily.length).toBe(true);
      expect(open).toBeLessThanOrEqual(daily.daily.at(-1 - age)!.prs_opened);
    }
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
    // The import transforms the whole root graph, the kit's inlined sources and CSS with it. Measured with this file
    // alone: 14 to 40 s with a warm disk cache, about 90 s on the first run of a session and 110 s right after
    // `npm ci`. In the full suite, a widget build in parallel, it took 7 to 9 s: the test files run in parallel workers
    // that share one Vite server's transforms, so a file of its own would not spare the cost. 300 s is near 3 times the
    // slowest. Only the root's real export list proves the second line, and a type check of the root costs the same.
  }, 300_000);
});
