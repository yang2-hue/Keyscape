/** Gallery state helpers kept free of JSX so they can be unit tested with
 * node --experimental-strip-types (which does not transform JSX). */

export type View = { kind: 'home' | 'close'; serial: number };

/** Every view change bumps the serial so the camera effect re-runs even when
 * the kind is unchanged (pressing "reset" twice). */
export function nextView(view: View, kind: View['kind']): View {
  return { kind, serial: view.serial + 1 };
}
