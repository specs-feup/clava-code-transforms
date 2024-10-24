import Query from "@specs-feup/lara/api/weaver/Query.js";
import FoldingPropagationCombiner from "../src/FoldingPropagationCombiner.js";
import { AstDumper } from "./AstDumper.js";
import { FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";

function main() {
    const dumper = new AstDumper();
    const astDump = dumper.dump();
    console.log(astDump);

    const funs: string[] = ["intAndInt", "intAndFloat", "kinds"];

    const constPropComb = new FoldingPropagationCombiner();
    for (const funName of funs) {
        const fun = Query.search(FunctionJp, { name: funName }).first()!;

        constPropComb.doPassesUntilStop(fun);
    }
}

main();
