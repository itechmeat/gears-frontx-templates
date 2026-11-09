import type { ReactNode } from 'react';
import { ExpandIcon } from 'lucide-react';
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
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
}

export const DEFAULT_FRAME_TEXTS: FrameTexts = {
  loading: 'Loading',
  cannotBeShown: 'This widget cannot be shown',
  openLarger: (title) => (title ? `Open ${title} larger` : 'Open larger view'),
  close: 'Close',
};

/** The body of a cell or of the larger view in one state: a loader announced as a status, the cannot-be-shown text, or the widget. */
export function StateBody({ state, texts, children }: { state: CellState; texts: FrameTexts; children?: ReactNode }) {
  if (state === 'loading') {
    return (
      <div className={styles.loading} role="status" aria-label={texts.loading}>
        <Skeleton className={styles.skeletonLine} />
        <Skeleton className={styles.skeletonBlock} />
      </div>
    );
  }
  if (state === 'cannot-be-shown') {
    return (
      <Text tone="muted" render={<p />} className={styles.cannot}>
        {texts.cannotBeShown}
      </Text>
    );
  }
  return <div className={styles.widget}>{children}</div>;
}

export interface LargerView {
  title: string;
  state: CellState;
  content?: ReactNode;
  /** Called when the overlay opens or closes; the root mounts the larger-view widget while it is open. */
  onOpenChange?: (open: boolean) => void;
  /** The root's own container, so the overlay stays inside it. */
  container?: HTMLElement | ShadowRoot | null;
}

// @cpt-dod:cpt-frontx-dashboard-dod-dashboard-runtime-frame:p1
/**
 * The frame the dashboard root draws around every cell: the widget's title,
 * the loader, the cannot-be-shown state and, only when the cell has a larger
 * view, the button that opens it in an overlay inside the root's container.
 */
export function CellFrame({
  title,
  state,
  children,
  largerView,
  texts = DEFAULT_FRAME_TEXTS,
}: {
  title?: string;
  state: CellState;
  children?: ReactNode;
  largerView?: LargerView;
  texts?: FrameTexts;
}) {
  return (
    <Card size="sm" className={styles.cell} aria-busy={state === 'loading' || undefined}>
      {title || largerView ? (
        <CardHeader>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {largerView ? (
            <CardAction>
              <Dialog onOpenChange={(open) => largerView.onOpenChange?.(open)}>
                <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={texts.openLarger(title ?? '')} icon={<ExpandIcon />} />} />
                <DialogContent size="lg" container={largerView.container ?? undefined} closeLabel={texts.close} className={styles.overlay} aria-modal="true">
                  <DialogHeader>
                    <DialogTitle>{largerView.title}</DialogTitle>
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
        <StateBody state={state} texts={texts}>
          {children}
        </StateBody>
      </CardContent>
    </Card>
  );
}
