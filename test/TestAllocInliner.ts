import { AllocatorInliner } from "../src/function/AllocatorInliner.js";

const allocInliner = new AllocatorInliner();
const allocatorFuns = allocInliner.findAllAllocatorFunctions();

for (const fun of allocatorFuns) {
    const nInlined = allocInliner.inlineAllocatorFunction(fun);
    console.log(`Inlined ${nInlined} calls to allocator function ${fun.name}`);
}
