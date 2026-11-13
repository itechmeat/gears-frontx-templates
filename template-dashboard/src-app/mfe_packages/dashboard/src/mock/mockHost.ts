import type { DashboardRequest, ServedAnswer, ServedFile } from '../contract';
import { RequestFailure, type DashboardHost } from '../runtime/host';
import { composeServedFile, loadWidgetParts, withWidgetParts } from '../runtime/served';
import catalog from '../../served/catalog.gts.json';
import demo from '../../served/demo-dashboards.gts.json';

/*
 * A host that answers the dashboard root without a backend: the served file
 * is the catalog plus the demo dashboards, and every data request is answered
 * from the fixtures below after a delay, as a product API would. A product
 * replaces it with its own `DashboardHost` (or `fetchHost` over its API); the
 * dashboards and widgets do not change.
 *
 * The numbers are the daily totals of an engineering organisation of about
 * 140 people over 31 days, Monday 2026-10-05 to Wednesday 2026-11-04.
 */

const DAYS = Array.from({ length: 31 }, (_, index) => new Date(Date.UTC(2026, 9, 5 + index)).toISOString().slice(0, 10));
const COMMITS = [54, 51, 57, 132, 78, 3, 11, 44, 64, 74, 58, 33, 30, 7, 62, 53, 42, 45, 48, 6, 6, 50, 93, 98, 76, 56, 11, 4, 43, 60, 83];
const PRS_MERGED = [31, 25, 27, 27, 24, 2, 0, 9, 23, 16, 22, 12, 6, 2, 11, 20, 17, 18, 22, 6, 7, 31, 22, 28, 40, 29, 3, 5, 20, 13, 34];
const PRS_OPENED = [30, 32, 40, 68, 27, 2, 4, 40, 42, 43, 27, 18, 5, 5, 21, 37, 27, 20, 31, 5, 6, 25, 34, 30, 46, 29, 4, 8, 28, 34, 50];
const DEPLOYS = [10, 6, 10, 8, 8, 1, 0, 8, 8, 7, 10, 4, 3, 1, 10, 3, 1, 6, 10, 3, 20, 20, 27, 36, 33, 21, 0, 0, 35, 32, 42];
// The deploys that caused an incident, in the last 7 days and in the 7 days before: the change failure rate is derived from them.
const FAILED_DEPLOYS = 14;
const PREVIOUS_FAILED_DEPLOYS = 14;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
/** The middle value of the sorted values, or the mean of the middle two for an even count. */
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const REPOS = ['payments-api', 'web-console', 'mobile-app', 'search-service', 'billing-worker', 'auth-gateway', 'data-pipeline', 'design-system', 'notifications', 'analytics-ui', 'infra-terraform', 'docs-site'];
const TEAMS = ['Platform', 'Web', 'Mobile', 'Search', 'Billing', 'Identity', 'Data', 'Design', 'Platform', 'Web', 'Infra', 'Docs'];
/** The review time in hours of each repository: the bubble chart draws it, the summary takes the median of it. */
const REVIEW_H = REPOS.map((_, index) => 4 + ((index * 37) % 30));
const PEOPLE = ['A. Novak', 'M. Petrova', 'J. Smith', 'L. Garcia', 'K. Ivanov', 'S. Chen', 'D. Kovac', 'R. Silva', 'T. Muller', 'E. Rossi'];

/** One open pull request per row, with an id such as `REQ-1000`: the grid's 200 rows. */
const PULL_REQUESTS = Array.from({ length: 200 }, (_, index) => {
  const seed = (index * 7919) % 997;
  return {
    id: `REQ-${1000 + index}`,
    title: `${['Fix', 'Add', 'Refactor', 'Update', 'Remove'][seed % 5]} ${['retry policy', 'login form', 'export job', 'cache keys', 'chart legend', 'audit log', 'rate limiter'][seed % 7]}`,
    repo: REPOS[seed % REPOS.length],
    author: PEOPLE[seed % PEOPLE.length],
    age_days: seed % 23,
    changed_lines: 12 + ((seed * 13) % 1800),
    state: ['open', 'review', 'approved', 'blocked'][seed % 4],
    url: `https://example.com/pulls/${1000 + index}`,
  };
});

/**
 * Commits by weekday and two-hour block of the day, UTC, over the 31 days: the block shape times the weekday share,
 * scaled to the daily commits; each cell rounds down and the commits left go one each to the cells with the largest
 * remainders, so the cells add up to the daily commits exactly.
 */
const BLOCKS = ['00', '02', '04', '06', '08', '10', '12', '14', '16', '18', '20', '22'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BY_BLOCK = [15, 23, 18, 102, 214, 296, 298, 247, 167, 73, 60, 19];
const WEEKDAY_SHARE = [1, 1.1, 1.05, 1.15, 0.9, 0.12, 0.08];
const HEATMAP_SCALE = sum(COMMITS) / (sum(BY_BLOCK) * sum(WEEKDAY_SHARE));
const HEATMAP_SHARES = WEEKDAY_SHARE.flatMap((share) => BY_BLOCK.map((block) => block * share * HEATMAP_SCALE));
const HEATMAP_LEFT = sum(COMMITS) - sum(HEATMAP_SHARES.map(Math.floor));
const HEATMAP_TOP = new Set(
  HEATMAP_SHARES.map((share, index) => ({ index, rest: share - Math.floor(share) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index)
    .slice(0, HEATMAP_LEFT)
    .map(({ index }) => index),
);
const HEATMAP_COUNTS = HEATMAP_SHARES.map((share, index) => Math.floor(share) + (HEATMAP_TOP.has(index) ? 1 : 0));

/**
 * Commits per day for the calendar heatmap: Monday 2026-06-08 to Wednesday 2026-11-04, about five months.
 * Every 47th day from the 20th has no row (nothing reported), so the calendar shows its empty tiles.
 */
const CALENDAR_DAYS = Array.from({ length: 150 }, (_, index) => new Date(Date.UTC(2026, 5, 8 + index)));
const CALENDAR = CALENDAR_DAYS.flatMap((date, index) =>
  index % 47 === 20 ? [] : [{ day: date.toISOString().slice(0, 10), commits: Math.round((40 + ((index * 37) % 61)) * WEEKDAY_SHARE[(date.getUTCDay() + 6) % 7]) }],
);

/**
 * How much a period scales the 30-day totals: the demo host's `period` value goes into the query as `7d`, `30d` or `90d`;
 * any other value, or none, keeps the 30-day numbers.
 */
const PERIOD_SCALE: Record<string, number> = { '7d': 7 / 30, '30d': 1, '90d': 3 };
const scaleOf = (query: URLSearchParams) => PERIOD_SCALE[query.get('period') ?? ''] ?? 1;

/**
 * CI runs per day by outcome over the last 14 days; on Sunday 2026-11-01 the runners were down, so that day has no run.
 */
const CI_DAILY = DAYS.slice(-14).map((day, index) => {
  const runs = day === '2026-11-01' ? 0 : Math.round(COMMITS[DAYS.length - 14 + index] * 7.5);
  return { day, passed: Math.round(runs * (0.74 + (index % 4) * 0.03)), failed: Math.round(runs * (0.1 - (index % 3) * 0.02)), cancelled: Math.round(runs * 0.08) };
});

/**
 * The state, test coverage (a share, 0 to 1) and daily commits of the last 14 days of each repository, for the grid
 * with badge, progress and sparkline columns. The last repository reports no state; one day of one repository has no
 * count, so its line shows a gap.
 */
const REPO_STATES = ['On track', 'On track', 'At risk', 'On track', 'Blocked', 'On track', 'At risk', 'On track', 'On track', 'At risk', 'On track', null];
const REPO_HEALTH = REPOS.map((repo, index) => ({
  repo,
  state: REPO_STATES[index],
  coverage: (42 + ((index * 37) % 50)) / 100,
  daily: COMMITS.slice(-14).map((value, day) => (index === 10 && day === 9 ? null : Math.round((value * (((index + day) % 5) + 1)) / 15))),
}));

/**
 * Pull requests of the last 30 days from opened to merged. Reviewed and approved split the gap between opened and
 * merged in thirds (rounded), so the stages are whole numbers and never grow.
 */
const FUNNEL = (() => {
  const opened = sum(PRS_OPENED.slice(-30));
  const merged = sum(PRS_MERGED.slice(-30));
  const third = (opened - merged) / 3;
  return { opened, reviewed: merged + Math.round(2 * third), approved: merged + Math.round(third), merged };
})();

const FIXTURES: Record<string, (body: unknown, query: URLSearchParams) => unknown> = {
  '/api/demo/delivery/daily': () => ({
    daily: DAYS.map((day, index) => ({ day, commits: COMMITS[index], prs_merged: PRS_MERGED[index], prs_opened: PRS_OPENED[index], deploys: DEPLOYS[index] })),
  }),
  '/api/demo/delivery/funnel': () => FUNNEL,
  '/api/demo/delivery/summary': () => ({
    commits: { value: sum(COMMITS.slice(-7)), previous: sum(COMMITS.slice(-14, -7)), daily: COMMITS.slice(-14) },
    deploys: { value: sum(DEPLOYS.slice(-7)), previous: sum(DEPLOYS.slice(-14, -7)), daily: DEPLOYS.slice(-14) },
    prs_merged: { value: sum(PRS_MERGED.slice(-7)), previous: sum(PRS_MERGED.slice(-14, -7)) },
    prs_opened: { value: sum(PRS_OPENED.slice(-7)), previous: sum(PRS_OPENED.slice(-14, -7)) },
    // The pull requests open now, and the median age of them: the rows the open pull requests grid shows.
    open_prs: { value: PULL_REQUESTS.length, median_age_days: median(PULL_REQUESTS.map((pull) => pull.age_days)) },
    // The median of the repositories' review times the activity request lists.
    review_h: { value: median(REVIEW_H) },
    lead_time_h: { value: 26.4, previous: 31.9 },
    // The deploys that caused an incident over the deploys, in the last 7 days and in the 7 days before.
    change_failure_rate: {
      value: FAILED_DEPLOYS / sum(DEPLOYS.slice(-7)),
      previous: PREVIOUS_FAILED_DEPLOYS / sum(DEPLOYS.slice(-14, -7)),
      failed_deploys: FAILED_DEPLOYS,
      previous_failed_deploys: PREVIOUS_FAILED_DEPLOYS,
    },
    active_contributors: { value: 118, previous: 121 },
  }),
  '/api/demo/ci/outcomes': (_body, query) => {
    const scale = scaleOf(query);
    return { passed: Math.round(24135 * scale), failed: Math.round(2753 * scale), cancelled: Math.round(4362 * scale), skipped: Math.round(3093 * scale) };
  },
  '/api/demo/repos/activity': (_body, query) => {
    const scale = scaleOf(query);
    return REPOS.map((repo, index) => ({
      repo,
      team: TEAMS[index],
      commits: Math.round(scale * COMMITS.reduce((total, value, day) => total + Math.round((value * ((index + day) % 5 + 1)) / 15), 0)),
      prs: Math.round(scale * (40 - index * 3)),
      review_h: REVIEW_H[index],
    })).sort((a, b) => b.commits - a.commits);
  },
  '/api/demo/teams/goals': () =>
    ['Platform', 'Web', 'Mobile', 'Search', 'Billing'].map((team, index) => ({ team, deployed: 18 + index * 7, target: 40 + index * 5 })),
  '/api/demo/pulls/open': () => ({ pulls: PULL_REQUESTS }),
  '/api/demo/repos/health': () => ({ repos: REPO_HEALTH }),
  '/api/demo/commits/heatmap': () => ({
    cells: WEEKDAYS.flatMap((weekday, day) => BLOCKS.map((block, index) => ({ weekday, block: `${block}:00`, count: HEATMAP_COUNTS[day * BLOCKS.length + index] }))),
  }),
  '/api/demo/commits/calendar': () => ({ days: CALENDAR }),
  '/api/demo/ci/daily': () => ({ daily: CI_DAILY }),
  '/api/demo/broken': () => {
    throw new RequestFailure('the mock API answers 500 for this path');
  },
};

/** The served file of the demo without its widget bundles: the catalog types and the demo dashboards. */
export const DEMO_SERVED_FILE: ServedFile = composeServedFile(catalog as ServedFile, demo as ServedFile);

export const DEMO_DASHBOARD_ID = 'gts.frontx.dashboard.dashboard.dashboard.v1~6a0f3c1e-8b2d-4f47-9e15-3c7a2b9d0e41';

/**
 * The mock host. `widgetList` is the address of the served widget list
 * (`dist/widgets.json` of the widgets package, served next to the bundles):
 * the served file is then `file` (or the files of a list it is) followed by
 * the part of every bundle on that list, each registered on its own, read on each dashboard request, so a bundle published or re-pointed shows
 * on the next page load. `file` replaces the demo file (catalog types and demo
 * dashboards), for tests and for checks of a broken file. `delayMs` delays
 * every answer like a network would.
 */
export function createMockHost({ delayMs = 300, file = DEMO_SERVED_FILE, widgetList }: { delayMs?: number; file?: unknown; widgetList?: string } = {}): DashboardHost {
  const answer = <T,>(signal: AbortSignal, value: () => T) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          // A fresh copy each time, as a parsed response body would be.
          resolve(structuredClone(value()));
        } catch (error) {
          reject(error);
        }
      }, delayMs);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new RequestFailure('aborted'));
      });
    });
  return {
    loadFile: async (signal) => {
      const served = await answer(signal, () => file);
      // `file` may be broken on purpose: the root's own check names the problem.
      if (!widgetList) return served as ServedAnswer;
      return withWidgetParts(served, () => loadWidgetParts(widgetList, signal));
    },
    request: (request: DashboardRequest, signal) => {
      const [path, query = ''] = request.path.split('#')[0].split('?');
      const fixture = FIXTURES[path];
      if (!fixture) return Promise.reject(new RequestFailure(`the mock API has no ${request.path}`));
      return answer(signal, () => fixture(request.body, new URLSearchParams(query)));
    },
  };
}
