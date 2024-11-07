import { FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { ArrayFlattener } from "../src/ArrayFlattener.js";
import { AstDumper } from "./AstDumper.js";

function main() {
    const dumper = new AstDumper();
    console.log(dumper.dump());

    for (const fun of Query.search(FunctionJp)) {
        const arrayFlattener = new ArrayFlattener();
        arrayFlattener.flattenAllInFunction(fun);
    }
}

main();
