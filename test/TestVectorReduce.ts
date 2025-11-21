import { VectorReduceSimplificator } from '../src/vectorreduce/VectorReduceSimplification.js';

const vrs: VectorReduceSimplificator = new VectorReduceSimplificator();

const res = vrs.simplify();

console.log(`Performed ${res} modifications`);