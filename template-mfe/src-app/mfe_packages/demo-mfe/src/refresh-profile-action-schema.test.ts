/**
 * Admission tests for `demo-mfe`'s own `refresh_profile` action schema
 * (`mfe.json`'s `schemas[0]`), run through the REAL `GtsPlugin` — the same
 * validator `register()` runs any action instance through before the
 * mediator ever looks for a handler. The schema is self-contained and
 * closed (`additionalProperties: false` on itself and on its own payload),
 * so an undeclared field at either level must be refused here, at
 * admission, not silently accepted.
 *
 * Built with `{ isolated: true }`: a plain `new GtsPlugin()` shares one store
 * with every other copy in the realm, and this file registers entities (and
 * the `refresh_profile` type) no other suite should see or be seen by.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GtsPlugin } from '@gears-frontx/gts-plugin';
import { extensionScreenSchema, languageCodeSchema, languageSchema, themeSchema } from '@gears-frontx/frontx-template-shell';
import type { ExtensionDomain, Extension } from '@gears-frontx/react';
import { PROFILE_EXTENSION_ID, DEMO_ACTION_REFRESH_PROFILE } from './shared/extension-ids';
import refreshProfileSchemaJson from '../mfe.json' with { type: 'json' };

const REFRESH_PROFILE_SCHEMA = refreshProfileSchemaJson.schemas[0] as Record<string, unknown>;

const SCREEN_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.screensets.layout.screen.v1';

const SCREEN_DOMAIN = {
  id: SCREEN_DOMAIN_ID,
  route: 'screen',
  sharedProperties: [],
  actions: [],
  extensionsActions: [],
  defaultActionTimeout: 5000,
  lifecycleStages: [],
  extensionsLifecycleStages: [],
} as unknown as ExtensionDomain;

const PROFILE_ENTRY_ID =
  'gts.frontx.mfes.mfe.entry.v1~frontx.mfes.mfe.entry_mf.v1~frontx.demo.mfe.profile.v1';

// A GTS instance reference must find its entity, so the extension's entry,
// and the manifest that entry names, are registered before the extension.
const MANIFEST = {
  id: 'gts.frontx.mfes.mfe.mf_manifest.v1~frontx.demo.mfe.manifest.v1',
  name: 'demoMfe',
  metaData: {
    name: 'demoMfe',
    type: 'app',
    buildInfo: { buildVersion: '1.0.0', buildName: 'demoMfe' },
    remoteEntry: { name: 'remoteEntry.js', path: '', type: 'module' },
    globalName: 'demoMfe',
    publicPath: 'http://localhost:3001/',
  },
  shared: [],
};

const PROFILE_ENTRY = {
  id: PROFILE_ENTRY_ID,
  requiredProperties: [],
  actions: [],
  domainActions: [],
  manifest: MANIFEST.id,
  exposedModule: './profile',
  exposeAssets: { js: { sync: [], async: [] }, css: { sync: [], async: [] } },
};

const PROFILE_EXTENSION = {
  id: PROFILE_EXTENSION_ID,
  domain: SCREEN_DOMAIN_ID,
  entry: PROFILE_ENTRY_ID,
  route: '/profile',
  presentation: {
    label: 'Profile',
  },
} as unknown as Extension;

let gtsPlugin: GtsPlugin;

beforeAll(() => {
  gtsPlugin = new GtsPlugin({ isolated: true });
  gtsPlugin.registerSchema(themeSchema);
  gtsPlugin.registerSchema(languageCodeSchema);
  gtsPlugin.registerSchema(languageSchema);
  gtsPlugin.registerSchema(extensionScreenSchema);
  gtsPlugin.registerSchema(REFRESH_PROFILE_SCHEMA as never);
  gtsPlugin.register(SCREEN_DOMAIN);
  gtsPlugin.register(MANIFEST);
  gtsPlugin.register(PROFILE_ENTRY);
  gtsPlugin.register(PROFILE_EXTENSION);
});

afterEach(() => {
  // Nothing mutates shared state across cases in this file (every
  // `register()` call below is an action instance check, not a new entity
  // registration) — kept for symmetry with this suite's sibling files.
});

describe('refresh_profile action schema — real GTS admission', () => {
  it('admits a well-formed refresh_profile action aimed at the Profile extension', () => {
    expect(() =>
      gtsPlugin.register({ type: DEMO_ACTION_REFRESH_PROFILE, target: PROFILE_EXTENSION_ID }),
    ).not.toThrow();
  });

  it('refuses a refresh_profile action carrying an undeclared top-level field', () => {
    expect(() =>
      gtsPlugin.register({
        type: DEMO_ACTION_REFRESH_PROFILE,
        target: PROFILE_EXTENSION_ID,
        extraneous: true,
      }),
    ).toThrow();
  });

  it('refuses a refresh_profile action carrying an undeclared payload field', () => {
    expect(() =>
      gtsPlugin.register({
        type: DEMO_ACTION_REFRESH_PROFILE,
        target: PROFILE_EXTENSION_ID,
        payload: { extraneous: true },
      }),
    ).toThrow();
  });
});
