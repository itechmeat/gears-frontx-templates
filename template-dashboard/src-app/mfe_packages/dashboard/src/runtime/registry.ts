import {
  ActionHandler,
  ConcurrentMountStrategy,
  ExtensionDomainImplementation,
  ExtensionDomainImplementationFactory,
  MfeBridgeFactory,
  MfeHandler,
  createMfeRegistryFactory,
  type ActionPayload,
  type ChildMfeBridge,
  type DomainContext,
  type ExtensionDomain,
  type MfeEntryLifecycle,
  type MfeEntryMF,
  type MfeRegistry,
  type MountStrategy,
  type TypeSystemPlugin,
} from '@gears-frontx/mfes';

import { ENTRY_MF_TYPE_ID } from '../contract';
import { WIDGETS_DOMAIN } from '../gts';

/*
 * The registry the dashboard root owns, with the `widgets` domain registered
 * in it (runtime FEATURE "Register the widgets domain"). The domain mounts
 * many extensions at once; each extension's container is a plain element the
 * root places into its cell.
 */

/** A widget entry's lifecycle factory, called once per generated extension so no two extensions share module state. */
export type WidgetEntries = Readonly<Record<string, () => MfeEntryLifecycle>>;

class UnusedBridgeFactory extends MfeBridgeFactory {
  create(): ChildMfeBridge {
    throw new Error('the registry creates the bridges of in-bundle entries');
  }
  dispose(): void {}
}

/**
 * Loads the widget entries the product bundles with the template: the entry
 * id names a lifecycle factory in `entries`. The registry still mounts each
 * extension in its own shadow root with its own bridge, so the widgets run as
 * FrontX MFEs behind the `render_widget` contract. An entry that is not in
 * `entries` fails its cell at mount.
 */
export class InBundleEntryHandler extends MfeHandler<MfeEntryMF> {
  readonly bridgeFactory = new UnusedBridgeFactory();

  constructor(private readonly entries: WidgetEntries) {
    super(ENTRY_MF_TYPE_ID, 10);
  }

  async load(entry: MfeEntryMF): Promise<MfeEntryLifecycle> {
    const create = this.entries[entry.id];
    if (!create) throw new Error(`no in-bundle lifecycle for entry ${entry.id}`);
    return create();
  }
}

/** What the root observes of the domain: a mount settling, and an unmount of an extension it did not ask to leave. */
export interface DomainEvents {
  mounted(extensionId: string, error?: unknown): void;
  unmounted(extensionId: string): void;
}

class WidgetsDomain extends ExtensionDomainImplementation {
  private readonly strategy: ConcurrentMountStrategy;

  constructor(ctx: DomainContext, containers: Map<string, HTMLElement>, events: DomainEvents) {
    super();
    this.strategy = new ConcurrentMountStrategy(ctx.mounter, {
      create: (extensionId) => {
        const container = document.createElement('div');
        container.dataset.widgetExtension = extensionId;
        // The container fills the cell's slot; the widget inside its shadow root fills the container.
        container.style.cssText = 'display:flex;flex-direction:column;flex:1;min-block-size:0;min-inline-size:0';
        containers.set(extensionId, container);
        return container;
      },
      destroy: (extensionId) => {
        containers.get(extensionId)?.remove();
        containers.delete(extensionId);
      },
    });
    ctx.registerHandler(
      ctx.typeSystem.resolveMountExtActionId(),
      ActionHandler.fromFunction(async (_type, payload) => {
        const subject = (payload as ActionPayload).subject;
        try {
          await this.strategy.mount(payload as ActionPayload);
        } catch (error) {
          events.mounted(subject, error);
          throw error;
        }
        events.mounted(subject);
      }),
    );
    ctx.registerHandler(
      ctx.typeSystem.resolveUnmountExtActionId(),
      ActionHandler.fromFunction(async (_type, payload) => {
        await this.strategy.unmount(payload as ActionPayload);
        events.unmounted((payload as ActionPayload).subject);
      }),
    );
  }

  protected getMountStrategies(): MountStrategy[] {
    return [this.strategy];
  }
}

class WidgetsDomainFactory extends ExtensionDomainImplementationFactory {
  constructor(
    private readonly containers: Map<string, HTMLElement>,
    private readonly events: DomainEvents,
  ) {
    super();
  }

  build(ctx: DomainContext): ExtensionDomainImplementation {
    return new WidgetsDomain(ctx, this.containers, this.events);
  }
}

/** Builds the root's own registry and registers the `widgets` domain in it; throws when the domain is rejected. */
export function createWidgetsRegistry(
  typeSystem: TypeSystemPlugin,
  entries: WidgetEntries,
  containers: Map<string, HTMLElement>,
  events: DomainEvents,
): MfeRegistry {
  const registry = createMfeRegistryFactory().build({ typeSystem, mfeHandlers: [new InBundleEntryHandler(entries)] });
  registry.registerDomain(WIDGETS_DOMAIN as unknown as ExtensionDomain, new WidgetsDomainFactory(containers, events));
  return registry;
}
