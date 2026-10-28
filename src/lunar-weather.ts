/** Weather on the Moon is not rain and fog. Each moment is a lighting regime the
 * base has to survive: a grazing terminator sun, a savage noon, a dust haze that
 * scatters the light, and the two-week night when only the lamps are alive. */

export type LunarMoment = 'terminator' | 'noon' | 'dust' | 'night';

export type LunarPreset = {
  id: LunarMoment;
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
  /** Key light position: the terminator sun must graze, noon must hammer. */
  key: [number, number, number];
  /** 0..1 starfield, 0..1 interior lamp level, 0..1 dust particle density. */
  stars: number;
  interior: number;
  dust: number;
};

export const LUNAR_MOMENTS: LunarPreset[] = [
  {
    id: 'terminator', label: '晨昏', title: '晨昏线', night: false,
    ambient: .05, ambientColor: '#93a8c8', hemisphere: .06, skyColor: '#8ea4c4', groundColor: '#22242a',
    sun: 3.0, sunColor: '#fff3e6', fill: .42, fillColor: '#93b0d6', env: .2,
    fog: .0035, fogColor: '#0d1014', key: [6.2, 3.4, 2.2],
    stars: .45, interior: .55, dust: .18,
  },
  {
    id: 'noon', label: '正午', title: '正午强光', night: false,
    ambient: .16, ambientColor: '#dbe6f2', hemisphere: .1, skyColor: '#c9d8ea', groundColor: '#4b4a48',
    sun: 3.4, sunColor: '#fbfdff', fill: .3, fillColor: '#b3c6dc', env: .18,
    fog: 0, fogColor: '#0b0c0e', key: [2.6, 8.2, 1.8],
    stars: .12, interior: .16, dust: .05,
  },
  {
    id: 'dust', label: '微尘', title: '月尘', night: false,
    ambient: .22, ambientColor: '#c9baa6', hemisphere: .14, skyColor: '#b9aa98', groundColor: '#5a5147',
    sun: 1.7, sunColor: '#f0d3ad', fill: .18, fillColor: '#8d8d93', env: .08,
    fog: .05, fogColor: '#6d6459', key: [5.2, 4.4, 3.4],
    stars: .26, interior: .38, dust: 1,
  },
  {
    id: 'night', label: '月夜', title: '月夜', night: true,
    ambient: .085, ambientColor: '#8ba4c6', hemisphere: .07, skyColor: '#8fa6c8', groundColor: '#1b1f25',
    sun: .04, sunColor: '#8ea7cd', fill: .14, fillColor: '#6d8cb4', env: .045,
    fog: .006, fogColor: '#080a0d', key: [-5.4, 6.2, -3.4],
    stars: 1, interior: 1, dust: .1,
  },
];

/** CSS class for the page behind the canvas: the room goes dark for the night
 * moment, and picks up the sun's colour as the light shifts. */
export function lunarSurface(moment: LunarMoment) {
  return `space-${moment}`;
}
