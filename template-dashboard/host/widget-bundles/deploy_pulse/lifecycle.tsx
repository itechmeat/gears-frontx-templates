import { Badge, Text } from '@gears-frontx/ui-kit';
import { createWidgetLifecycle, type WidgetRenderer } from '@gears-frontx/frontx-dashboard-widgets/lifecycle';

/*
 * A widget type of the product, not of the template: the host app was built
 * without it. It ships as its own bundle with its types in served.gts.json,
 * and reaches a dashboard by being added to the served widget list.
 */

interface DeployPulseData {
  deploys: number;
  previous: number;
}

export const render: WidgetRenderer = (payload, { locale }) => {
  const { deploys, previous } = payload.data as unknown as DeployPulseData;
  const change = deploys - previous;
  const format = new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2, 8px)', padding: 'var(--spacing-3, 12px)' }}>
      <Text typography="kpi" render={<strong />}>
        {new Intl.NumberFormat(locale).format(deploys)} deploys
      </Text>
      <div>
        <Badge variant={change >= 0 ? 'success' : 'danger'}>{format.format(change)} vs last week</Badge>
      </div>
      <Text typography="meta" tone="muted" render={<span />}>
        Product widget, version 1
      </Text>
    </div>
  );
};

export default createWidgetLifecycle(render);
