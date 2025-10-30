import { Call, ExprStmt, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { Inliner } from "./Inliner.js";

export class CallTreeInliner extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("CallTreeInliner", silent);
    }

    public inlineCallTree(topLevelFunction: FunctionJp, removeInlined: boolean = false, prefix: string = "_i"): boolean {
        let isChanging = true;
        let totalInlined = 0;
        const inlinedFuns: Set<FunctionJp> = new Set();

        const inliner = new Inliner(true);
        this.log(`Starting call tree inlining from function ${topLevelFunction.name}`);

        while (isChanging) {
            isChanging = false;
            const calls = Query.searchFrom(topLevelFunction, Call).get();

            for (const call of calls) {
                if (!call.function.isImplementation) {
                    continue;
                }

                const inlineOk = inliner.inline(call, prefix);

                if (inlineOk) {
                    isChanging = true;
                    totalInlined++;
                    inlinedFuns.add(call.function);
                    this.log(`  Inlined call to function ${call.function.name}()`);
                }
                else {
                    this.logWarning(`  Failed to inline call to function ${call.function.name} at ${call.location}`);
                }
            }
        }
        this.log(`Inlined a total of ${totalInlined} function calls in the call tree of function ${topLevelFunction.name}.`);

        if (removeInlined) {
            for (const fun of inlinedFuns) {
                fun.detach();
            }
            this.log(`Removed ${inlinedFuns.size} inlined function implementations.`);
        }
        this.rebuildAfterTransform();
        return true;
    }
}