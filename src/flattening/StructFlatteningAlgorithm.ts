import { Call, FunctionJp, Joinpoint } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

export abstract class StructFlatteningAlgorithm extends AdvancedTransform {
    constructor(name: string, silent: boolean = false) {
        super(name, silent);
    }

    public abstract decompose(fields: Joinpoint[], structName: string, functions: FunctionJp[]): void;
}
