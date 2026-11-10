import type { RenderWidgetPayload } from '@gears-frontx/frontx-dashboard-root/contract';

import type { MarkdownCardRender } from '../types';

/** A `markdown_card` sample: a short note about the dashboard, with a link. It carries no data. */
export const MARKDOWN_CARD_SAMPLE: RenderWidgetPayload<MarkdownCardRender> = {
  render: {
    body: [
      'Delivery numbers of the **engineering organisation**, refreshed daily at 07:00 UTC.',
      'Read the [metric definitions](https://example.com/metrics) before comparing teams.',
      '- Commits count the default branch only\n- A deploy counts a rollout to production, rollbacks included',
    ].join('\n\n'),
  },
};
