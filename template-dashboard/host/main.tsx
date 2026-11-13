import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@gears-frontx/ui-kit/theme.css';
import { Button, Heading } from '@gears-frontx/ui-kit';
import { Dashboard, DashboardRoot, kitScopeOf } from '@gears-frontx/frontx-dashboard-root';
import { createMockHost, DEMO_DASHBOARD_ID } from '@gears-frontx/frontx-dashboard-root/mock';

import './host.css';

/*
 * A plain React application with no FrontX shell that embeds a dashboard as a
 * component: it creates one dashboard root with a host that answers the
 * root's requests (here the mock API) and renders <Dashboard>. Dev-only, not
 * part of the template. The widgets are not in this app's bundle: the root
 * loads each one from its own widget bundle, named by the served widget list
 * the dev server serves at /widgets/widgets.json (build them first with
 * `npm run build:widgets`). Query: ?theme=dark|light, ?dashboard=<id>, ?delay=<ms>.
 */

const params = new URLSearchParams(location.search);
const root = new DashboardRoot({ host: createMockHost({ delayMs: Number(params.get('delay') ?? 300), widgetList: '/widgets/widgets.json' }) });

function App() {
  const [theme, setTheme] = useState(params.get('theme') ?? 'light');
  const [dashboardId, setDashboardId] = useState(params.get('dashboard') ?? DEMO_DASHBOARD_ID);
  const [shown, setShown] = useState(true);
  document.documentElement.dataset.theme = kitScopeOf(theme);
  return (
    <main className="host">
      <div className="host-bar">
        <Heading typography="heading-1" render={<h1 />}>Dashboard host</Heading>
        <Button variant="outline" size="sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShown(!shown)}>
          {shown ? 'Leave the dashboard' : 'Open the dashboard'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDashboardId(dashboardId === DEMO_DASHBOARD_ID ? 'gts.frontx.dashboard.dashboard.dashboard.v1~00000000-0000-4000-8000-000000000000' : DEMO_DASHBOARD_ID)}>
          {dashboardId === DEMO_DASHBOARD_ID ? 'Open an unknown dashboard' : 'Open the demo dashboard'}
        </Button>
      </div>
      {shown ? <Dashboard root={root} dashboardId={dashboardId} theme={theme} language="en" /> : null}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
