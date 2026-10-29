/** An abandoned hill station has weather a lunar base cannot: blue hour, a hard
 * clear night, a cold dawn, and wind that carries grit across the rock. The four
 * moments are lighting regimes first and particles second. */

export type ObservatoryMoment = 'dusk' | 'night' | 'dawn' | 'wind';

export type ObservatoryPreset = {
  id: ObservatoryMoment;
  label: string;
  title: string;
  night: boolean;
  ambient: number;
  ambientColor: string;
  hemisphere: number;
  skyColor: string;
  groundColor: string;
  sun: number;
  sunColor: string;
  fill: number;
  fillColor: string;
  env: number;
  fog: number;
  fogColor: string;
  /** Key light position: dusk grazes, night is moonlight, dawn comes from the east. */
  key: [number, number, number];
  /** 0..1 starfield, 0..1 interior lamp level, 0..1 dust particle density. */
  stars: number;
  interior: number;
  dust: number;
};

export const OBSERVATORY_MOMENTS: ObservatoryPreset[] = [
  {
    id: 'dusk', label: '薄暮', title: '薄暮侧光', night: false,
    ambient: .05, ambientColor: '#9aa6bf', hemisphere: .04, skyColor: '#8d9cc0', groundColor: '#2b2721',
    sun: 2.6, sunColor: '#ffcf9d', fill: .3, fillColor: '#7d8fb5', env: .05,
    fog: .012, fogColor: '#4a4a56', key: [-5.6, 2.6, 3.4],
    stars: .22, interior: .85, dust: .18,
  },
  {
    id: 'night', label: '深夜', title: '深夜月光', night: true,
    ambient: .022, ambientColor: '#8896b4', hemisphere: .022, skyColor: '#7c8dad', groundColor: '#14161a',
    sun: .62, sunColor: '#c3d4f2', fill: .12, fillColor: '#5c6f93', env: .03,
    fog: .008, fogColor: '#0a0d12', key: [3.4, 5.2, -4.2],
    stars: 1, interior: 1, dust: .06,
  },
  {
    id: 'dawn', label: '黎明', title: '黎明冷光', night: false,
    ambient: .06, ambientColor: '#a9bccc', hemisphere: .05, skyColor: '#aebecd', groundColor: '#2d2c2a',
    sun: 1.6, sunColor: '#dbe7f4', fill: .2, fillColor: '#93a8bb', env: .05,
    fog: .022, fogColor: '#8a9099', key: [5.8, 2.2, -2.6],
    stars: .1, interior: .35, dust: .1,
  },
  {
    id: 'wind', label: '风起', title: '风起扬尘', night: false,
    ambient: .07, ambientColor: '#b0a897', hemisphere: .06, skyColor: '#a9a08f', groundColor: '#3a352c',
    sun: 1.1, sunColor: '#e7dcc4', fill: .18, fillColor: '#8d8574', env: .06,
    fog: .03, fogColor: '#6d6555', key: [-2.4, 6.0, 3.0],
    stars: .05, interior: .5, dust: 1,
  },
];

export const observatoryPreset = (moment: ObservatoryMoment) =>
  OBSERVATORY_MOMENTS.find(item => item.id === moment) ?? OBSERVATORY_MOMENTS[0];

/** CSS class for the page behind the canvas, matching the lunar convention. */
export function observatorySurface(moment: ObservatoryMoment) {
  return `observatory-${moment}`;
}
