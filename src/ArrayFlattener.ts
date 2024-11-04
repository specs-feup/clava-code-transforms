import { FunctionJp, Param, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import IdGenerator from "@specs-feup/lara/api/lara/util/IdGenerator.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AdvancedTransform } from "./AdvancedTransform.js";

export class ArrayFlattener extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("ArrayFlattener", silent);
    }

    public flattenAllInFunction(fun: FunctionJp): number {
        for (const param of Query.searchFrom(fun, Param)) {
            this.flattenParameterArray(fun, param);
        }

        const id = IdGenerator.next("foo");
        return 0;
    }

    private flattenParameterArray(fun: FunctionJp, arrayParam: Param): void {

    }

    private flattenLocalArray(fun: FunctionJp, arrayVar: Varref): void {

    }
}