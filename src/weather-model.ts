/** Weather presets for the crescent study.
 *
 * Kept in a plain .ts module (no JSX) so the values can be unit tested with
 * `node --experimental-strip-types`. The renderer only damps toward these
 * numbers, so every preset is a target, never a switch. */

export type WeatherKind = 'clear' | 'rain' | 'mist';

export type WeatherParams = {
  /** Ambient + hemisphere fill. */
  ambient: number;
  ambientColor: string;
  /** Key (sun) light. */
  sun: number;
  sunColor: string;
  /** Cool rim light opposite the sun. */
  fill: number;
  /** Studio environment contribution. */
  env: number;
  /** Exponential squared fog density; 0 leaves the far sea clear. */
  fog: number;
  /** Must stay close to the page background, or the fog reads as a gray wall. */
  fogColor: string;
};

export const WEATHERS: { id: WeatherKind; label: string; title: string }[] = [
  { id: 'clear', label: '晴', title: '晴天' },
  { id: 'rain', label: '雨', title: '下雨' },
  { id: 'mist', label: '雾', title: '雾' },
];

/** Day and night are separate rows rather than a multiplier: rainy daylight
 * still needs a readable key light, while a foggy night is mostly ambient. */
const TABLE: Record<WeatherKind, { day: WeatherParams; night: WeatherParams }> = {
  clear: {
    day: { ambient: 0.35, ambientColor: '#fff7e9', sun: 2.0, sunColor: '#fff2d7', fill: 0.6, env: 0.35, fog: 0, fogColor: '#e9e5dc' },
    night: { ambient: 0.14, ambientColor: '#c8d6e4', sun: 0.18, sunColor: '#9fb6d6', fill: 0.17, env: 0.12, fog: 0.006, fogColor: '#1b3040' },
  },
  rain: {
    day: { ambient: 0.52, ambientColor: '#b9cdd6', sun: 0.5, sunColor: '#c3d7de', fill: 0.8, env: 0.16, fog: 0.03, fogColor: '#b9cbcb' },
    night: { ambient: 0.18, ambientColor: '#a9bcc6', sun: 0.09, sunColor: '#8fa6b4', fill: 0.22, env: 0.09, fog: 0.034, fogColor: '#16262f' },
  },
  mist: {
    day: { ambient: 0.68, ambientColor: '#e7e4da', sun: 0.3, sunColor: '#f2ece0', fill: 0.7, env: 0.3, fog: 0.075, fogColor: '#e7e3d9' },
    night: { ambient: 0.24, ambientColor: '#c2cbd0', sun: 0.12, sunColor: '#9fb0c0', fill: 0.2, env: 0.14, fog: 0.08, fogColor: '#1a2b33' },
  },
};

export function weatherParams(kind: WeatherKind, night: boolean): WeatherParams {
  return TABLE[kind][night ? 'night' : 'day'];
}

/** Rain drops and surface rings only make sense for one preset. */
export function isWet(kind: WeatherKind) {
  return kind === 'rain';
}
