import Query from "@specs-feup/lara/api/weaver/Query.js";
import { BinaryOp, FunctionJp, Literal, Scope, Statement, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js"

export default class ConstantPropagator {
    private fun: FunctionJp;

    constructor(fun: FunctionJp) {
        this.fun = fun;
    }

    public doPass(): number {
        let replacements = 0;


        return replacements;
    }
}