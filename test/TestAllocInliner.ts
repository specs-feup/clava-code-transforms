import { AllocatorInliner } from "../src/function/AllocatorInliner.js";

const allocInliner = new AllocatorInliner();
const allocatorFuns = allocInliner.findAllAllocatorFunctions();

console.log(allocatorFuns.map((f) => f.name));