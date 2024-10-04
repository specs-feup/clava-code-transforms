import Query from "@specs-feup/lara/api/weaver/Query.js";
import { Voidifier } from "../src/Voidifier.js";
import { FunctionJp, Statement } from "@specs-feup/clava/api/Joinpoints.js";
import StatementDecomposer from "@specs-feup/clava/api/clava/code/StatementDecomposer.js";
import NormalizeToSubset from "@specs-feup/clava/api/clava/opt/NormalizeToSubset.js";

function reduceToSubset() {
    for (const fun of Query.search(FunctionJp, { "isImplementation": true })) {
        const body = fun.body;
        NormalizeToSubset(body, { simplifyLoops: { forToWhile: false } });
    }

    const decomp = new StatementDecomposer();
    for (var stmt of Query.search(Statement, { isInsideHeader: false })) {
        decomp.decomposeAndReplace(stmt);
    }
}

function main() {
    reduceToSubset();

    const vf = new Voidifier();
    for (const fun of Query.search(FunctionJp, { "isImplementation": true })) {
        if (fun.name != "main") {
            vf.voidify(fun, "return_value");
        }
    }
}

main();