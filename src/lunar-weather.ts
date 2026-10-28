/** Weather on the Moon is not rain and fog. Each moment is a lighting regime the
 * base has to survive: a grazing terminator sun, a savage noon, a dust haze that
 * scatters the light, and the two-week night when only the lamps are alive. */

export type LunarMoment = 'terminator' | 'noon' | 'dust' | 'night' | 'meteors';

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
    ambient: .04, ambientColor: '#93a8c8', hemisphere: .035, skyColor: '#8299c0', groundColor: '#1e2228',
    sun: 4.2, sunColor: '#ffe6c6', fill: .12, fillColor: '#8aa6d0', env: .08,
    fog: .0035, fogColor: '#0d1014', key: [6.6, 2.35, 2.3],
    stars: .45, interior: .55, dust: .18,
  },
  {
    id: 'noon', label: '正午', title: '正午强光', night: false,
    ambient: .032, ambientColor: '#c8d8ea', hemisphere: .025, skyColor: '#bccddd', groundColor: '#33322f',
    sun: 3.5, sunColor: '#fbfdff', fill: .05, fillColor: '#a9bdd8', env: .035,
    fog: 0, fogColor: '#0b0c0e', key: [3.6, 6.0, 2.6],
    stars: .12, interior: .16, dust: .05,
  },
  {
    id: 'dust', label: '微尘', title: '月尘', night: false,
    ambient: .22, ambientColor: '#c9baa6', hemisphere: .14, skyColor: '#b9aa98', groundColor: '#5a5147',
    sun: 1.7, sunColor: '#f0d3ad', fill: .18, fillColor: '#8d8d93', env: .08,
    fog: .008, fogColor: '#222328', key: [5.2, 4.4, 3.4],
    stars: .26, interior: .38, dust: 1,
  },
  {
    id: 'night', label: '月夜', title: '月夜', night: true,
    ambient: .038, ambientColor: '#7f98bd', hemisphere: .03, skyColor: '#7d94b8', groundColor: '#13161a',
    sun: .03, sunColor: '#8ea7cd', fill: .06, fillColor: '#5f7ea8', env: .025,
    fog: .006, fogColor: '#080a0d', key: [-5.4, 6.2, -3.4],
    stars: 1, interior: 1, dust: .1,
  },
  {
    id: 'meteors', label: '流星雨', title: '流星雨', night: true,
    ambient: .045, ambientColor: '#7f98bd', hemisphere: .035, skyColor: '#7d94b8', groundColor: '#13161a',
    sun: .06, sunColor: '#8ea7cd', fill: .07, fillColor: '#5f7ea8', env: .03,
    fog: .002, fogColor: '#080a0d', key: [-5.4, 6.2, -3.4],
    stars: 1, interior: 1, dust: .04,
  },
];

/** CSS class for the page behind the canvas: the room goes dark for the night
 * moment, and picks up the sun's colour as the light shifts. */
export function lunarSurface(moment: LunarMoment) {
  return `space-${moment}`;
}
