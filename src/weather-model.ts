/** Weather presets for the crescent study.
 *
 * Kept in a plain .ts module (no JSX) so the values can be unit tested with
 * `node --experimental-strip-types`. The renderer only damps toward these
 * numbers, so every preset is a target, never a switch. */

export type WeatherKind = 'clear' | 'rain' | 'mist';
/** Shared with the water shader so its sun glint follows the same key light. */
export const KEY_LIGHT_POSITION:[number,number,number]=[-4.5,5,3.2];

export type WeatherParams = {
  /** Ambient + hemisphere fill. */
  ambient: number;
  ambientColor: string;
  hemisphere:number;
  skyColor:string;
  groundColor:string;
  /** Key (sun) light. */
  sun: number;
  sunColor: string;
  /** Cool rim light opposite the sun. */
  fill: number;
  fillColor:string;
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
    day: { ambient: .20, ambientColor: '#fff4e7', hemisphere:.30, skyColor:'#edf3f5',groundColor:'#928975',sun: 1.95, sunColor: '#ffeccf', fill: .36,fillColor:'#bdcfde', env: .25, fog: 0, fogColor: '#f4f4f2' },
    night: { ambient: .075, ambientColor: '#a8bfdc',hemisphere:.10,skyColor:'#a6bfdd',groundColor:'#293340', sun: .30, sunColor: '#a5c4f0', fill: .32,fillColor:'#7398c1', env: .075, fog: .006, fogColor: '#111c29' },
  },
  rain: {
    day: { ambient: .30, ambientColor: '#c0d0d8',hemisphere:.34,skyColor:'#c2d2de',groundColor:'#697b77', sun: .62, sunColor: '#dae5e9', fill: .48,fillColor:'#abc3d5', env: .14, fog: .03, fogColor: '#b9cbcb' },
    night: { ambient: .085, ambientColor: '#9db3c8',hemisphere:.11,skyColor:'#9bb1c9',groundColor:'#26333c', sun: .10, sunColor: '#9cb6d0', fill: .22,fillColor:'#7897b0', env: .06, fog: .034, fogColor: '#14212d' },
  },
  mist: {
    day: { ambient: .37, ambientColor: '#e1e3df',hemisphere:.40,skyColor:'#e2e8e9',groundColor:'#8f9488', sun: .42, sunColor: '#f0ece1', fill: .34,fillColor:'#bdcdd4', env: .18, fog: .075, fogColor: '#e7e3d9' },
    night: { ambient: .11, ambientColor: '#b1c1ce',hemisphere:.14,skyColor:'#afc1d0',groundColor:'#303a43', sun: .12, sunColor: '#b1c2d5', fill: .20,fillColor:'#8ea6bd', env: .095, fog: .08, fogColor: '#172633' },
  },
};

export function weatherParams(kind: WeatherKind, night: boolean): WeatherParams {
  return TABLE[kind][night ? 'night' : 'day'];
}

/** Rain drops and surface rings only make sense for one preset. */
export function isWet(kind: WeatherKind) {
  return kind === 'rain';
}
