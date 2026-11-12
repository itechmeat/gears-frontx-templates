/**
 * Lifecycle Hooks on the Real GTS Store
 *
 * A domain or an extension whose `lifecycle` hook dispatches an action must
 * register through the same `typeSystem.register()` call the MFE bootstrap
 * makes for manifest domains. Runs the pinned `@gears-frontx/gts-plugin`
 * without mocks: gts-plugin 0.6.0 refused every such hook, because the base
 * action schema checked `type` with a `/$id` operand that the GTS library
 * resolves to the domain or extension type when the action sits in a hook.
 * The hook's action `target` is checked at registration too, which is why
 * the bootstrap walk documents an order for hook targets.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Extension, ExtensionDomain, MfeEntry } from '@gears-frontx/mfes';
import { GtsPlugin } from '@gears-frontx/gts-plugin';
import { sidebarDomain } from '../../../src/plugins/microfrontends/base-domains';

const DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.test.layout.target.v1';
const HOOKED_DOMAIN_ID = 'gts.frontx.mfes.ext.domain.v1~frontx.test.layout.hooked.v1';
const ENTRY_ID = 'gts.frontx.mfes.mfe.entry.v1~frontx.test.mfe.entry.v1';
const EXT_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.test.mfe.ext.v1';
const LATER_EXT_ID = 'gts.frontx.mfes.ext.extension.v1~frontx.test.mfe.later.v1';
const NOTIFY_ACTION_ID = 'gts.frontx.mfes.comm.action.v1~frontx.test.mfe.notify.v1~';

// An application action derived from the base action that targets an
// extension, which mount_ext's own schema does not allow (domains only).
// The plugin checks a hook's action against the base action and requires
// its type to be registered; this schema's own target shape is for the
// reader and is not applied to the hook.
const notifyActionSchema = {
  $id: `gts://${NOTIFY_ACTION_ID}`,
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { 'x-gts-type-ref': '/$id' },
    target: { 'x-gts-instance-ref': 'gts.frontx.mfes.ext.extension.v1~*' },
    timeout: { type: 'number', minimum: 1 },
  },
  required: ['type', 'target'],
};

describe('lifecycle hooks with an actions chain on the real GtsPlugin', () => {
  let plugin: GtsPlugin;
  let init: string;
  let activated: string;
  let mountExt: string;
  let loadExt: string;

  beforeEach(() => {
    plugin = new GtsPlugin({ isolated: true });
    init = plugin.resolveLifecycleStageInitId();
    activated = plugin.resolveLifecycleStageActivatedId();
    mountExt = plugin.resolveMountExtActionId();
    loadExt = plugin.resolveLoadExtActionId();

    const entry: MfeEntry = { id: ENTRY_ID, requiredProperties: [], actions: [], domainActions: [] };
    plugin.register(entry);
    plugin.register(domain(DOMAIN_ID));
  });

  // Shaped like the template's base domains; shared properties are left out
  // because their types are registered by the framework, not by the plugin.
  function domain(id: string, lifecycle?: ExtensionDomain['lifecycle']): ExtensionDomain {
    return { ...sidebarDomain, id, sharedProperties: [], lifecycle };
  }

  it('registers a domain whose init hook mounts an extension into the domain itself', () => {
    const hooked = domain(HOOKED_DOMAIN_ID, [
      {
        stage: init,
        actions_chain: { action: { type: mountExt, target: HOOKED_DOMAIN_ID, payload: { subject: EXT_ID } } },
      },
    ]);

    expect(() => plugin.register(hooked)).not.toThrow();
    expect(plugin.validateInstance(HOOKED_DOMAIN_ID).valid).toBe(true);
  });

  it('registers an extension whose activated hook chains mount_ext and load_ext', () => {
    const extension: Extension = {
      id: EXT_ID,
      domain: DOMAIN_ID,
      entry: ENTRY_ID,
      lifecycle: [
        {
          stage: activated,
          actions_chain: {
            action: { type: mountExt, target: DOMAIN_ID, payload: { subject: EXT_ID } },
            next: { action: { type: loadExt, target: DOMAIN_ID, payload: { subject: EXT_ID } } },
          },
        },
      ],
    };

    expect(() => plugin.register(extension)).not.toThrow();
    expect(plugin.validateInstance(EXT_ID).valid).toBe(true);
  });

  it('refuses a hook whose action type is the domain type', () => {
    const hooked = domain(HOOKED_DOMAIN_ID, [
      {
        stage: init,
        actions_chain: { action: { type: 'gts.frontx.mfes.ext.domain.v1~', target: DOMAIN_ID } },
      },
    ]);

    expect(() => plugin.register(hooked)).toThrow(/actions_chain\/action\/type/);
  });

  it('refuses a hook whose action target is an extension not registered yet, and accepts it once it is', () => {
    const extension: Extension = {
      id: EXT_ID,
      domain: DOMAIN_ID,
      entry: ENTRY_ID,
      lifecycle: [{ stage: activated, actions_chain: { action: { type: NOTIFY_ACTION_ID, target: LATER_EXT_ID } } }],
    };
    plugin.registerSchema(notifyActionSchema);

    expect(() => plugin.register(extension)).toThrow(/actions_chain\/action\/target/);

    plugin.register({ id: LATER_EXT_ID, domain: DOMAIN_ID, entry: ENTRY_ID });
    expect(() => plugin.register(extension)).not.toThrow();
  });
});
