/** Gallery state helpers kept free of JSX so they can be unit tested with
 * node --experimental-strip-types (which does not transform JSX). */

export type View = { kind: 'home' | 'close'; serial: number };

/** Resolve `?work=<id>` to a gallery index. Unknown or missing ids fall back
 * to the first work, so a stale link never opens the wrong study silently. */
export function workIndexFromSearch(search: string, ids: readonly string[]): number {
  const id = new URLSearchParams(search).get('work');
  if (!id) return 0;
  const index = ids.indexOf(id);
  return index >= 0 ? index : 0;
}

/** Every view change bumps the serial so the camera effect re-runs even when
 * the kind is unchanged (pressing "reset" twice). */
export function nextView(view: View, kind: View['kind']): View {
  return { kind, serial: view.serial + 1 };
}
