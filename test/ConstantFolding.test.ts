import { FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import {
    FunctionConstantFolder,
    GlobalConstantFolder,
} from "../src/constfolding/ConstantFolder.js";
import { GlobalConstantPropagator } from "../src/constfolding/ConstantPropagator.js";
import { registerSourceCodeEach } from "./jestHelpers.js";

const source = `
const int limit = 7;
int folded_global = 6 * 7;

int calculate(void) {
    return (2 + 3) * (10 - 6);
}

int read_limit(void) {
    return limit;
}
`;

describe("constant folding and propagation", () => {
    registerSourceCodeEach(source);

    test("folds nested function expressions over successive passes", () => {
        const fun = Query.search(FunctionJp, { name: "calculate" }).first()!;
        const folder = new FunctionConstantFolder(fun);

        expect(folder.doPass()).toBe(2);
        expect(folder.doPass()).toBe(1);
        expect(folder.doPass()).toBe(0);
        expect(fun.code).toContain("return 20;");
    });

    test("folds global initializers", () => {
        const folder = new GlobalConstantFolder();

        expect(folder.doPass()).toBe(1);
        expect(Query.root().code).toContain("folded_global = 42");
    });

    test("propagates constant globals into functions", () => {
        const propagator = new GlobalConstantPropagator(true);
        const fun = Query.search(FunctionJp, { name: "read_limit" }).first()!;

        expect(propagator.doPass()).toBe(1);
        expect(fun.code).toContain("return 7;");
    });
});
