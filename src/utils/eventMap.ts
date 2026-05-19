import type { DatasetModel } from '../datasetModel.ts';

// Minimal structural type for Three.js Object3D — avoids @types/three dependency.
// Replace with THREE.Object3D if/when @types/three is added.
interface Object3DLike {
    readonly type: string;
    name: string;
}

export interface EventMap {
    'assembly:emphasis':          { assembly: { name: string; color?: string }; nodeSet: Set<string>; mode?: 'walk' | 'subgraph'; emphasisColor: string; deemphasisColor: string };
    'assembly:normal':            { nodeSet: Set<string> };
    'pcaWidget:emphasis':         { assembly: { name: string }; resolvedAssemblyKey?: string; nodeSet: Set<string>; absentNodeSet: Set<string>; deemphasisColor: string };
    'pcaWidget:normal':           { nodeSet: Set<string> };
    'pcaWidget:absence':          { absentNodeSet: Set<string> };
    'pcaWidget:deselect':         Record<string, never>;
    'population:selected':        { acronym: string };
    'population:deselected':      { population: object; acronym: string };
    'superpopulation:selected':   { acronym: string };
    'superpopulation:deselected': { superpopulation: object; acronym: string };
    'lineIntersection':           { t: number; nodeName: string; nodeLine: Object3DLike };
    'clearIntersection':          Record<string, never>;
    'datasetLoaded':              { dataset: DatasetModel };
    'pclai-system-changed':       { system: 'hg38' | 'asm' };
}
