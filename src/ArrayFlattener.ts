import { FunctionJp, Param, Varref } from "@specs-feup/clava/api/Joinpoints.js"


export default class ArrayFlattener {
    constructor() { }

    flattenAllInFunction(fun: FunctionJp) {
        console.log("[ArrayFlattener] Flattening arrays in function " + fun.name);

    }

    flattenParameterArray(fun: FunctionJp, arrayParam: Param) {

    }

    flattenLocalArray(fun: FunctionJp, arrayVar: Varref) {

    }
}