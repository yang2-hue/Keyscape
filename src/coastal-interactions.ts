/** Explicit visitor actions; sequence permits repeating the same action. */
export type CoastalActionKind='cottage-0'|'cottage-1'|'lights-auto'|'gull';
export type CoastalAction={id:number;kind:CoastalActionKind};

/** null follows the exhibition's day/night cycle; an explicit choice persists. */
export function cottageLightTarget(override:boolean|null,night:boolean){return override??night;}
export function toggleCottageLight(override:boolean|null,night:boolean){return !cottageLightTarget(override,night);}
