import { Joinpoint } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";

export abstract class StructFlatteningAlgorithm extends AdvancedTransform {
    constructor(name: string, silent: boolean = false) {
        super(name, silent);
    }

    public abstract decompose(fields: Joinpoint[], structName: string): void;
}
