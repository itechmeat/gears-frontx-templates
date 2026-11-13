import type { ReactNode } from 'react';
import { ExpandIcon } from 'lucide-react';
import {
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
  /** The text and accessible name of the button under the cannot-be-shown text of a cell whose data request failed. Optional, so texts written before it still type-check; without it, the default. */
  retry?: string;
}

export const DEFAULT_FRAME_TEXTS: Required<FrameTexts> = {
  loading: 'Loading',
  cannotBeShown: 'This widget cannot be shown',
  openLarger: (title) => (title ? `Open ${title} larger` : 'Open larger view'),
  close: 'Close',
  retry: 'Try again',
};

/**
 * The body of a cell or of the larger view in one state: a loader announced as a status, the cannot-be-shown text, or
 * the widget. With `onRetry` the cannot-be-shown text gets a retry button under it (only a failed data request passes it).
 */
export function StateBody({ state, texts, children, onRetry }: { state: CellState; texts: FrameTexts; children?: ReactNode; onRetry?: () => void }) {
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
    return (
      <div className={styles.cannotRetry}>
        {text}
        <Button variant="outline" size="sm" onClick={onRetry}>
          {texts.retry ?? DEFAULT_FRAME_TEXTS.retry}
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
  /** The root's own container, so the overlay stays inside it. */
  container?: HTMLElement | ShadowRoot | null;
}

// @cpt-dod:cpt-frontx-dashboard-dod-dashboard-runtime-frame:p1
/**
 * The frame the dashboard root draws around every cell whose `frame` is not false: the widget's title,
 * its optional description line under the title, the loader, the cannot-be-shown state and, only when the cell has a larger
 * view, the button that opens it in an overlay inside the root's container.
 */
export function CellFrame({
  title,
  description,
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
  /** A short line under the title, one line with an ellipsis; without it the header shows the title alone. */
  description?: string;
  state: CellState;
  children?: ReactNode;
  largerView?: LargerView;
  texts?: FrameTexts;
}) {
  if (!frame) {
    return (
      <div className={styles.frameless} aria-busy={state === 'loading' || undefined}>
        <StateBody state={state} texts={texts} onRetry={onRetry}>
          {children}
        </StateBody>
      </div>
    );
  }
  return (
    <Card size="sm" className={styles.cell} aria-busy={state === 'loading' || undefined}>
      {title || description || largerView ? (
        <CardHeader>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? (
            <CardDescription className={styles.description} title={description}>
              {description}
            </CardDescription>
          ) : null}
          {largerView ? (
            <CardAction>
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
            </CardAction>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent className={styles.body}>
        <StateBody state={state} texts={texts} onRetry={onRetry}>
          {children}
        </StateBody>
      </CardContent>
    </Card>
  );
}
