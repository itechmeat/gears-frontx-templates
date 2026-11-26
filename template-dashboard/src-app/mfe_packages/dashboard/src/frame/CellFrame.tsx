import { useLayoutEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from 'react';
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
} from '@gears-frontx/ui-kit';

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
}

export const DEFAULT_FRAME_TEXTS: Required<FrameTexts> = {
  loading: 'Loading',
  cannotBeShown: 'This widget cannot be shown',
  openLarger: (title) => (title ? `Open ${title} larger` : 'Open larger view'),
  close: 'Close',
  retry: 'Try again',
  retryNamed: (title) => (title ? `Try again to load ${title}` : 'Try again'),
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

export interface LargerView {
  title: string;
  /** The larger-view widget's own line under its title; without it the overlay header shows the title alone. */
  description?: string;
  state: CellState;
  content?: ReactNode;
  /** Called when the overlay opens or closes; the root mounts the larger-view widget while it is open. */
  onOpenChange?: (open: boolean) => void;
  /** The element the overlay mounts in: the root's own container, or the host's `overlayContainer`. */
  container?: HTMLElement | ShadowRoot | null;
}

/** How the frame draws a cell's description: a line under the title, or a badge beside the cell's actions. */
export type DescriptionDisplay = 'line' | 'badge';

/**
 * The description as a badge, at most 10 rem wide. A text the badge cuts with an ellipsis makes the badge a button
 * that opens the whole text in a popover, by click, tap, Enter or Space, or on hover, so the text is not left to a
 * mouse tooltip; a text that fits stays a plain badge.
 */
function DescriptionBadge({ text, container }: { text: string; container?: HTMLElement | ShadowRoot | null }) {
  const label = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const element = label.current;
    if (!element) return undefined;
    const measure = () => setCut(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, cut]);
  const content = (
    <span ref={label} className={styles.descriptionText}>
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
      <PopoverTrigger openOnHover render={<Badge variant="secondary" className={`${styles.description} ${styles.descriptionButton}`} render={<button type="button" />} />}>
        {content}
      </PopoverTrigger>
      <PopoverContent container={container ?? undefined} className={styles.descriptionPopover}>
        {text}
      </PopoverContent>
    </Popover>
  );
}

// @cpt-dod:cpt-frontx-dashboard-dod-dashboard-runtime-frame:p1
/**
 * The frame the dashboard root draws around every cell whose `frame` is not false: the widget's title,
 * its optional description (a line under the title, or a badge beside the cell's actions), the loader, the
 * cannot-be-shown state and, only when the cell has a larger view, the button that opens it in an overlay inside the
 * root's container.
 */
export function CellFrame({
  title,
  description,
  descriptionDisplay = 'line',
  container,
  state,
  children,
  largerView,
  texts = DEFAULT_FRAME_TEXTS,
  frame = true,
  onRetry,
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
  /** The element the description's popover mounts in: the root's own container, or the host's `overlayContainer`. */
  container?: HTMLElement | ShadowRoot | null;
  state: CellState;
  children?: ReactNode;
  largerView?: LargerView;
  texts?: FrameTexts;
}) {
  const focus = useRetryFocus(state, onRetry);
  if (!frame) {
    return (
      <div ref={focus.wrapper} tabIndex={-1} data-cell-frame="none" className={styles.frameless} aria-busy={state === 'loading' || undefined}>
        <StateBody state={state} texts={texts} onRetry={focus.retry} retryRef={focus.button}>
          {children}
        </StateBody>
      </div>
    );
  }
  const badge = descriptionDisplay === 'badge';
  const larger = largerView ? (
    <Dialog onOpenChange={(open) => largerView.onOpenChange?.(open)}>
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={texts.openLarger(title ?? '')} icon={<ExpandIcon />} />} />
      <DialogContent size="lg" container={largerView.container ?? undefined} closeLabel={texts.close} className={styles.overlay} aria-modal="true">
        <DialogHeader>
          <DialogTitle>{largerView.title}</DialogTitle>
          {largerView.description ? <DialogDescription>{largerView.description}</DialogDescription> : null}
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
      className={styles.cell}
      aria-busy={state === 'loading' || undefined}
    >
      {title || description || largerView ? (
        <CardHeader>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description && !badge ? (
            <CardDescription className={styles.descriptionLine} title={description}>
              {description}
            </CardDescription>
          ) : null}
          {badge && description ? (
            <CardAction className={styles.actions}>
              <DescriptionBadge text={description} container={container} />
              {larger}
            </CardAction>
          ) : larger ? (
            <CardAction>{larger}</CardAction>
          ) : null}
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
