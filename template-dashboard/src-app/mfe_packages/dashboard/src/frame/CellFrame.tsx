import { Component, isValidElement, useLayoutEffect, useReducer, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { ExpandIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@gears-frontx/ui-kit';

import type { CardSize, DescriptionDisplay } from '../contract';
import { escapeControls, firstLineOf } from '../runtime/register';
import styles from './frame.module.css';

/** The cell load state the root owns. The widget's own empty state is `shown` for the root. */
export type CellState = 'loading' | 'shown' | 'cannot-be-shown';

/** The root's own wordings, default English; the host language replaces them. */
export interface FrameTexts {
  loading: string;
  cannotBeShown: string;
  openLarger: (title: string) => string;
  close: string;
  /**
   * The text of the button under the cannot-be-shown text of a cell whose data request failed, and its accessible name
   * in a cell without a title. Optional, so texts written before it still type-check; without it, or blank, the default.
   */
  retry?: string;
  /**
   * The accessible name of that button in a cell with a title, from the title; it starts with the `retry` text, so the
   * name holds what the button shows. Without it the default, unless the host gives its own `retry`: then the name is
   * that text alone, so the name never mixes two languages. A blank result gives the plain name.
   */
  retryNamed?: (title: string) => string;
  /** The accessible name of a description badge's popover in a cell without a title. Optional; without it the default. */
  description?: string;
}

export const DEFAULT_FRAME_TEXTS: Required<FrameTexts> = {
  loading: 'Loading',
  cannotBeShown: 'This widget cannot be shown',
  openLarger: (title) => (title ? `Open ${title} larger` : 'Open larger view'),
  close: 'Close',
  retry: 'Try again',
  retryNamed: (title) => (title ? `Try again to load ${title}` : 'Try again'),
  description: 'Description',
};

/** The retry button's visible text and accessible name in a cell with this title (empty for none). */
export function retryTexts(texts: FrameTexts, title: string) {
  const text = texts.retry?.trim() ? texts.retry : DEFAULT_FRAME_TEXTS.retry;
  const named = texts.retryNamed ?? (texts.retry?.trim() ? undefined : DEFAULT_FRAME_TEXTS.retryNamed);
  const name = title.trim() && named ? named(title) : '';
  return { text, name: name.trim() ? name : text };
}

/**
 * Keeps the keyboard user's place across a retry: activating the button switches the cell to loading, which removes
 * the button. While it loads, focus that fell out goes to the wrapper (`tabIndex={-1}`); when the retry fails again it
 * goes to the new button, and when the widget shows it stays on the wrapper. Focus the viewer moved elsewhere is left
 * alone, on the host page too when the dashboard sits in a shadow root. A retry that changes nothing ends there, so a
 * later change of the cell never moves focus.
 */
export function useRetryFocus(state: CellState, onRetry: (() => void) | undefined) {
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // 'asked' from a retry until the commit it causes, 'loading' while the loading that retry started lasts.
  const pending = useRef<'no' | 'asked' | 'loading'>('no');
  const seen = useRef(state);
  // The retry commits even when it changes no state, so the effect can end an 'asked' that nothing followed.
  const [, settle] = useReducer((count: number) => count + 1, 0);
  useLayoutEffect(() => {
    const changed = seen.current !== state;
    seen.current = state;
    const element = wrapper.current;
    if (pending.current === 'no') return;
    if (!element || (!changed && pending.current === 'asked')) {
      pending.current = 'no';
      return;
    }
    if (!changed) return;
    // In a shadow root `root.activeElement` is null while focus is on a host-page control: the document tells
    // whether focus fell out, and only then is it lost.
    const outer = element.ownerDocument.activeElement;
    const lost = !outer || outer === element.ownerDocument.body;
    const active = lost ? null : (element.getRootNode() as Document | ShadowRoot).activeElement;
    if (state === 'loading' && pending.current === 'asked') {
      pending.current = 'loading';
      if (lost) element.focus();
      return;
    }
    pending.current = 'no';
    if (!lost && active !== element) return;
    if (state === 'cannot-be-shown' && button.current) button.current.focus();
    else element.focus();
  });
  const retry = onRetry
    ? () => {
        pending.current = 'asked';
        onRetry();
        settle();
      }
    : undefined;
  return { wrapper, button, retry };
}

/**
 * The body of a cell or of the larger view in one state: a loader announced as a status, the cannot-be-shown text, or
 * the widget. With `onRetry` the cannot-be-shown text gets a retry button under it (only a failed data request passes it).
 */
export function StateBody({
  state,
  texts,
  children,
  onRetry,
  title = '',
  retryRef,
}: {
  state: CellState;
  texts: FrameTexts;
  children?: ReactNode;
  onRetry?: () => void;
  /** The cell's title, for the retry button's name; empty for a cell without one. */
  title?: string;
  retryRef?: RefObject<HTMLButtonElement | null>;
}) {
  if (state === 'loading') {
    return (
      <div className={styles.loading} role="status" aria-label={texts.loading}>
        <Skeleton className={styles.skeletonLine} />
        <Skeleton className={styles.skeletonBlock} />
      </div>
    );
  }
  if (state === 'cannot-be-shown') {
    const text = (
      <Text tone="muted" render={<p />} className={styles.cannot}>
        {texts.cannotBeShown}
      </Text>
    );
    if (!onRetry) return text;
    const retry = retryTexts(texts, title);
    return (
      <div className={styles.cannotRetry}>
        {text}
        <Button ref={retryRef} variant="outline" size="sm" onClick={onRetry} aria-label={retry.name === retry.text ? undefined : retry.name}>
          {retry.text}
        </Button>
      </div>
    );
  }
  return <div className={styles.widget}>{children}</div>;
}

/** An action the host puts on a cell or on its larger view, drawn by the frame as a kit button. */
export interface CellAction {
  /** Unique within its cell or larger view: the button's React key. */
  id: string;
  /** The button's text, or with `icon` its accessible name; its tooltip either way. In the host language. */
  label: string;
  /**
   * A string, a number, an element (for example a lucide-react icon) or a non-empty list of those: the button then
   * shows the icon only. A boolean, null, undefined or an empty string is no icon (so `icon: cond && <Icon />` works):
   * the button shows its label.
   */
  icon?: ReactElement | string | number | boolean | null | readonly (ReactElement | string | number)[];
  /** Runs when the viewer activates the button; the host's own closure knows the cell. */
  onSelect: () => void;
}

const isIconPart = (value: unknown) => (typeof value === 'string' && value !== '') || typeof value === 'number' || isValidElement(value);

/** An `icon` the frame draws: a non-empty string, a number, an element, or a non-empty list of those. */
export const isIcon = (icon: unknown): boolean => isIconPart(icon) || (Array.isArray(icon) && icon.length > 0 && icon.every(isIconPart));

/** An `icon` that means no icon: the button shows its label. */
export const isNoIcon = (icon: unknown): boolean => icon === undefined || icon === null || typeof icon === 'boolean' || icon === '';

/**
 * A control whose name shows as a kit tooltip on hover and on keyboard focus, opened in `container`: an icon-only
 * control named by `name` (set on the control itself), or a text control whose label may be cut, so a sighted viewer
 * gets the whole name a screen reader reads. The tooltip is not tied to the control as its description, so a screen
 * reader hears the name once.
 */
function Named({ name, container, children }: { name: string; container?: HTMLElement | ShadowRoot | null; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent container={container ?? undefined}>{name}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The host's actions as ghost kit buttons, each with its label in a tooltip: an action with an icon shows the icon
 * only, named by its label; a text action shows its label, cut with an ellipsis when the header is too narrow.
 */
function HostActions({ actions, container }: { actions?: readonly CellAction[]; container?: HTMLElement | ShadowRoot | null }) {
  return actions?.map(({ id, label, icon, onSelect }) => (
    <Named key={id} name={label} container={container}>
      {isIcon(icon) ? (
        <Button variant="ghost" size="sm" aria-label={label} icon={icon as ReactNode} onClick={() => onSelect()} />
      ) : (
        <Button variant="ghost" size="sm" className={styles.textAction} onClick={() => onSelect()}>
          <span className={styles.textActionLabel}>{label}</span>
        </Button>
      )}
    </Named>
  ));
}

/**
 * Keeps a throw of the host's actions (an icon whose component throws as it renders) inside their slot: the slot then
 * draws no host action and writes one console line, and the cell and the rest of the dashboard keep working. The slot
 * tries again when its list of action ids changes.
 */
class HostActionsGuard extends Component<{ ids: string; children: ReactNode }, { failed: boolean; ids: string }> {
  state = { failed: false, ids: this.props.ids };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: { ids: string }, state: { failed: boolean; ids: string }) {
    return props.ids === state.ids ? null : { failed: false, ids: props.ids };
  }

  componentDidCatch(error: unknown) {
    console.error(`[dashboard] ${escapeControls(`the host cellActions failed: ${firstLineOf(error, 'it threw a value that cannot be shown')}`)}`);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The host's actions of one slot, inside their guard. */
function GuardedActions({ actions, container }: { actions: readonly CellAction[]; container?: HTMLElement | ShadowRoot | null }) {
  return (
    <HostActionsGuard ids={JSON.stringify(actions.map(({ id }) => id))}>
      <HostActions actions={actions} container={container} />
    </HostActionsGuard>
  );
}

export interface LargerView {
  title: string;
  /** The larger-view widget's own line under its title; without it the overlay header shows the title alone. */
  description?: string;
  state: CellState;
  content?: ReactNode;
  /** Called when the overlay opens or closes; the root mounts the larger-view widget while it is open. */
  onOpenChange?: (open: boolean) => void;
  /**
   * The element the overlay mounts in: the root's own container, or the host's `overlayContainer`; without it, the
   * document body. The tooltips of the larger view's actions open where the overlay mounts, here or in the document
   * body without it. The larger-view button sits in the cell header: its tooltip opens here, or in the frame's
   * `container` without it.
   */
  container?: HTMLElement | ShadowRoot | null;
  /** The host's actions on the open larger view, drawn in the overlay header under its title. */
  actions?: readonly CellAction[];
}

/**
 * The description as a badge, at most 10 rem wide. A text the badge cuts with an ellipsis makes the badge a button
 * that opens the whole text in a popover, by click, tap, Enter or Space, so the text is not left to a mouse tooltip;
 * Escape or a click outside closes it and focus returns to the badge. A text that fits stays a plain badge. The popover
 * is named by the cell title, or by `name` in a cell without one.
 */
function DescriptionBadge({ text, title, name, container }: { text: string; title?: string; name: string; container?: HTMLElement | ShadowRoot | null }) {
  // The measured span is a new node when the badge turns into a button and back, so the effect follows the element.
  const [label, setLabel] = useState<HTMLSpanElement | null>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    if (!label) return undefined;
    const measure = () => setCut(label.scrollWidth > label.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(label);
    return () => observer.disconnect();
  }, [label, text]);
  const content = (
    <span ref={setLabel} className={styles.descriptionText}>
      {text}
    </span>
  );
  if (!cut) {
    return (
      <Badge variant="secondary" className={styles.description}>
        {content}
      </Badge>
    );
  }
  return (
    <Popover>
      <PopoverTrigger render={<Badge variant="secondary" className={`${styles.description} ${styles.descriptionButton}`} render={<button type="button" />} />}>
        {content}
      </PopoverTrigger>
      <PopoverContent container={container ?? undefined} className={styles.descriptionPopover} aria-label={title?.trim() ? title : name}>
        {text}
      </PopoverContent>
    </Popover>
  );
}

// @cpt-dod:cpt-frontx-dashboard-dod-dashboard-runtime-frame:p1
/**
 * The frame the dashboard root draws around every cell whose `frame` is not false: the widget's title,
 * its optional description (a line under the title, or a badge beside the cell's actions), the loader, the
 * cannot-be-shown state, the host's actions and, only when the cell has a larger view, the button that opens it in an
 * overlay inside the root's container.
 */
export function CellFrame({
  title,
  description,
  descriptionDisplay = 'line',
  cardSize = 'sm',
  container,
  state,
  children,
  largerView,
  texts = DEFAULT_FRAME_TEXTS,
  frame = true,
  onRetry,
  actions,
}: {
  /** Set while the cell's data request failed: the cannot-be-shown text gets a retry button that calls it. */
  onRetry?: () => void;
  /** `false`: no card, header or larger-view button; the states and the widget sit straight in the grid cell. */
  frame?: boolean;
  title?: string;
  /** A short text; without it the header shows the title alone. */
  description?: string;
  /**
   * `line` (the default): the description is a line under the title, one line with an ellipsis, the full text in its
   * title attribute. `badge`: a badge beside the cell's actions, on the title's row, so it takes 4 px of the body's height in place of the line's 24 px.
   */
  descriptionDisplay?: DescriptionDisplay;
  /** `sm` (the default) or `default`; a frameless cell starts its content where the cards of that size start theirs. */
  cardSize?: CardSize;
  /**
   * The element the cell header's tooltips and the description badge's popover mount in: the root passes its own
   * container, or the host's `overlayContainer`. Without it they mount in the larger view's container, and without
   * both in the document body, outside a shadow root and outside the root's theme scope, so a host that draws
   * `CellFrame` itself passes `container` or `largerView.container`. The larger-view button's tooltip mounts in the
   * larger view's container, or in this one without it. Everything inside the open larger view mounts where its overlay
   * does, in the larger view's own container and never in this one, so a host that passes only `container` gets the
   * overlay and its tooltips in the document body.
   */
  container?: HTMLElement | ShadowRoot | null;
  state: CellState;
  children?: ReactNode;
  largerView?: LargerView;
  texts?: FrameTexts;
  /**
   * The host's actions on the cell, drawn as buttons before the larger-view button, each with its label in a tooltip.
   * A frameless cell draws none.
   */
  actions?: readonly CellAction[];
}) {
  const focus = useRetryFocus(state, onRetry);
  if (!frame) {
    return (
      <div ref={focus.wrapper} tabIndex={-1} data-cell-frame="none" className={[styles.frameless, cardSize === 'default' && styles.framelessDefault].filter(Boolean).join(' ')} aria-busy={state === 'loading' || undefined}>
        <StateBody state={state} texts={texts} onRetry={focus.retry} retryRef={focus.button}>
          {children}
        </StateBody>
      </div>
    );
  }
  const badge = descriptionDisplay === 'badge';
  const withBadge = badge && description ? description : undefined;
  const hostActions = actions?.length ? actions : undefined;
  let headerClass: string | undefined;
  if (withBadge || hostActions) headerClass = title ? styles.badgeHeader : styles.badgeHeaderUntitled;
  if (hostActions) headerClass = `${headerClass} ${styles.hostActionsHeader}`;
  // One rule for every tooltip and popover of the frame: the cell header's open in `container`, or in the larger view's
  // container without it; the larger-view button's opens in the larger view's container, or in `container` without it;
  // everything inside the open larger view opens where its dialog mounts, the larger view's own container.
  const inHeader = container ?? largerView?.container;
  const forLargerButton = largerView?.container ?? container;
  const openName = largerView ? texts.openLarger(title ?? '') : '';
  const larger = largerView ? (
    <Dialog onOpenChange={(open) => largerView.onOpenChange?.(open)}>
      <Named name={openName} container={forLargerButton}>
        <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={openName} icon={<ExpandIcon />} />} />
      </Named>
      <DialogContent size="lg" container={largerView.container ?? undefined} closeLabel={texts.close} className={styles.overlay} aria-modal="true">
        <DialogHeader>
          <DialogTitle>{largerView.title}</DialogTitle>
          {largerView.description ? <DialogDescription>{largerView.description}</DialogDescription> : null}
          {largerView.actions?.length ? (
            <div className={styles.overlayActions}>
              <GuardedActions actions={largerView.actions} container={largerView.container} />
            </div>
          ) : null}
        </DialogHeader>
        <div className={styles.overlayBody}>
          <StateBody state={largerView.state} texts={texts}>
            {largerView.content}
          </StateBody>
        </div>
      </DialogContent>
    </Dialog>
  ) : null;
  return (
    <Card
      ref={focus.wrapper}
      tabIndex={-1}
      // Named by its title, so focus that lands on the cell during a retry says which cell it is.
      role={title ? 'group' : undefined}
      aria-label={title || undefined}
      data-cell-frame="card"
      size={cardSize}
      className={styles.cell}
      aria-busy={state === 'loading' || undefined}
    >
      {title || description || largerView || hostActions ? (
        <CardHeader className={headerClass}>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description && !badge ? (
            <CardDescription className={styles.descriptionLine} title={description}>
              {description}
            </CardDescription>
          ) : null}
          {withBadge || hostActions ? (
            <CardAction className={hostActions ? `${styles.actions} ${styles.withHostActions}` : styles.actions}>
              {withBadge ? <DescriptionBadge text={withBadge} title={title} name={texts.description?.trim() ? texts.description : DEFAULT_FRAME_TEXTS.description} container={inHeader} /> : null}
              {hostActions ? (
                <span className={styles.buttons}>
                  <GuardedActions actions={hostActions} container={inHeader} />
                  {larger}
                </span>
              ) : (
                larger
              )}
            </CardAction>
          ) : null}
          {!withBadge && !hostActions && larger ? <CardAction>{larger}</CardAction> : null}
        </CardHeader>
      ) : null}
      <CardContent className={styles.body}>
        <StateBody state={state} texts={texts} onRetry={focus.retry} title={title} retryRef={focus.button}>
          {children}
        </StateBody>
      </CardContent>
    </Card>
  );
}
