import { Call, ExprStmt, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Inliner from "@specs-feup/clava/api/clava/code/Inliner.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

export class CallTreeInliner extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("CallTreeInliner", silent);
    }

    public inlineCallTree(startingPoint: FunctionJp, removeInlined: boolean = false, prefix: string = "_i"): boolean {
        const funs = this.getFunctionChain(startingPoint).slice(1); // Exclude starting function
        const inlined = this.inlineFunctionTree(startingPoint, prefix);
        if (!inlined) {
            return false;
        }

        if (!removeInlined) {
            funs.forEach((fun) => {
                if (this.canRemoveFunction(fun)) {
                    fun.detach();
                    this.log(`Removed function ${fun.name} after inlining.`);
                }
            });
            this.log(`Removed ${funs.length} functions after inlining the call tree.`);
        }
        return inlined;
    }

    private inlineFunctionTree(fun: FunctionJp, prefix: string): boolean {
        const inliner = new Inliner({ prefix: prefix });

        this.log(`Inlining call tree starting at function ${fun.name}, it may take a while...`);
        const res = inliner.inlineFunctionTree(fun);
        if (res) {
            this.log(`Successfully inlined call tree`);
        } else {
            this.logError(`Failed to inline call tree`);
        }
        return res;
    }

    private canRemoveFunction(fun: FunctionJp): boolean {
        const nCalls = Query.search(Call, { signature: fun.signature }).get().length;
        if (nCalls > 0) {
            this.logWarning(`Function ${fun.name} has ${nCalls} remaining calls, cannot remove.`);
            return false;
        }
        return true;
    }
}