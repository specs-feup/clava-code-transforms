import { Call, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

export class CallHoisting extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("CallHoisting", silent);
    }

    public hoist(call: Call): boolean {
        const parentCallee = call.getAncestor("function") as FunctionJp;
        const parentCallers = Query.search(Call, { signature: parentCallee.signature }).get();

        if (parentCallers.length == 0) {
            this.logError(`No callers found for function ${parentCallee.signature}`);
            return false;
        }
        if (parentCallers.length > 1) {
            this.logError(`Multiple callers found for function ${parentCallee.signature}`);
            return false;
        }
        const parentCaller = parentCallers[0];

        if (parentCaller.signature === call.signature) {
            this.logError(`Call ${call.code} cannot be hoisted to itself, i.e., it is a recursive function`);
            return false;
        }

        const argsNotModified = this.checkArgsNotModified(call, parentCaller);
        if (!argsNotModified) {
            this.logError(`Call ${call.code} cannot be hoisted to ${parentCaller.code} because the arguments are modified before the call`);
            return false;
        }

        return true;
    }

    private checkArgsNotModified(call: Call, parentCaller: Call): boolean {
        return true;
    }
}
