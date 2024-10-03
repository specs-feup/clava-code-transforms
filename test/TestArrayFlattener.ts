import { FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import ArrayFlattener from "../src/ArrayFlattener.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

function main() {

    for (const loop of Query.search(FunctionJp)) {
        const arrayFlattener = new ArrayFlattener();
        arrayFlattener.flattenAllInFunction(loop);
    }
}

main();
