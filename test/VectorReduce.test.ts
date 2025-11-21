import { registerSourceCodeEach, registerSourceCode } from './jestHelpers.js';
import { VectorReduceSimplificator } from '../src/vectorreduce/VectorReduceSimplification.js';
import fs from "node:fs";
import { Joinpoint } from '@specs-feup/clava/api/Joinpoints.js';
import Query from '@specs-feup/lara/api/weaver/Query.js';
import Clava from '@specs-feup/clava/api/clava/Clava.js';

const simpleCompleteCode = fs.readFileSync("./input/vectorreduce/SimpleComplete.c", "utf-8");
const simplePartialCode = fs.readFileSync("./input/vectorreduce/SimplePartial.c", "utf-8");

describe("simple complete", () => {
    console.log(simpleCompleteCode);
    registerSourceCode(simpleCompleteCode);

    test("simple complete finds one opportunity", () => {
        const vrs: VectorReduceSimplificator = new VectorReduceSimplificator(false);
        const res = vrs.simplify();
        expect(res).toBe(1);

        // console.log((Query.root() as Joinpoint).code);
    });
});

describe("simple partial", () => {
    console.log(simplePartialCode);
    registerSourceCode(simplePartialCode);

    test("simple partial finds one opportunity", () => {
        const vrs: VectorReduceSimplificator = new VectorReduceSimplificator(false);
        const res = vrs.simplify();
        expect(res).toBe(1);

        // console.log((Query.root() as Joinpoint).code);
    });
});