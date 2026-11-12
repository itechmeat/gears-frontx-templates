import { useEffect } from 'react';
import { Link, VisuallyHidden } from '@gears-frontx/ui-kit';

import type { WidgetTexts } from './states';

// Read a target the way the browser URL parser does: tabs and line breaks removed, leading and trailing controls and spaces trimmed.
const cleanOf = (href: string) => href.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
// Two slashes, either way round, start a protocol-relative target: another host.
const PROTOCOL_RELATIVE = /^[\\/]{2}/;

/**
 * The grid's rule for a link target: http, https, or a relative target on the same site (not `//host`).
 * The grid keeps this rule as it shipped; card links take the stricter `linkTargetOf`.
 */
export function isSafeHref(href: string): boolean {
  const cleaned = cleanOf(href);
  if (PROTOCOL_RELATIVE.test(cleaned)) return false;
  const scheme = SCHEME.exec(cleaned)?.[1]?.toLowerCase();
  return scheme === undefined || scheme === 'http' || scheme === 'https';
}

/** A target a card may link to, and whether it leaves the page's origin; or why it may not. */
export type LinkTarget = { href: string; external: boolean } | { problem: string };

/**
 * The shared rule for a card link target: `https:`, `http:`, `mailto:`, or a path from the site root (`/...`, not `//`).
 * Any other scheme, a protocol-relative target, another relative target and an unparsable one are refused; the
 * problem names the kind of target, never the target itself, which is delivered data.
 */
export function linkTargetOf(href: string, origin: string): LinkTarget {
  const cleaned = cleanOf(href);
  if (PROTOCOL_RELATIVE.test(cleaned)) return { problem: 'a protocol-relative target' };
  if (cleaned.startsWith('/')) return { href: cleaned, external: false };
  const scheme = SCHEME.exec(cleaned)?.[1]?.toLowerCase();
  if (scheme === undefined) return { problem: 'a relative target that does not start with /' };
  if (scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto') return { problem: `the ${scheme}: scheme` };
  try {
    const url = new URL(cleaned);
    return { href: url.href, external: scheme !== 'mailto' && url.origin !== origin };
  } catch {
    return { problem: 'an unparsable target' };
  }
}

/**
 * A card link through the shared rule. A refused target draws the text alone and writes one console line with the
 * reason; the cell does not fail. A link to another origin opens in a new tab without access to its opener, and says so.
 */
export function SafeLink({ text, href, texts, className }: { text: string; href: string; texts: WidgetTexts; className?: string }) {
  const target = linkTargetOf(href, window.location.origin);
  const problem = 'problem' in target ? target.problem : null;
  useEffect(() => {
    if (problem) console.warn(`[widget] a link is shown as text: ${problem}`);
  }, [problem]);
  if ('problem' in target) return <span className={className}>{text}</span>;
  return (
    <Link href={target.href} external={target.external} rel={target.external ? 'noopener noreferrer' : undefined} className={className}>
      {text}
      {target.external ? <VisuallyHidden> ({texts.link.newTab})</VisuallyHidden> : null}
    </Link>
  );
}
