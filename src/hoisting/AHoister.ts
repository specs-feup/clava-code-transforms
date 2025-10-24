import { Call, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

export abstract class AHoister extends AdvancedTransform {
    constructor(silent: boolean = false, name: string = "AHoister") {
        super(name, silent);
    }

    protected getTargetPoint(targetPoint?: FunctionJp): FunctionJp | undefined {
        if (targetPoint != undefined) {
            this.log(`Using provided target point: function ${targetPoint.name}`);
            return targetPoint;
        }

        targetPoint = Query.search(FunctionJp, { name: "main" }).first();
        if (targetPoint == undefined) {
            this.logError("No starting point provided and 'main' function not found.");
            return undefined;
        }
        else {
            this.log(`Starting point not provided. Using 'main' function as starting point.`);
        }
        return targetPoint;
    }

    protected verifyHoistConditions(call: Call, targetPoint: FunctionJp): boolean {
        const funChain = this.getFunctionChain(targetPoint);
        let inChain = false;
        for (const func of funChain) {
            for (const c of Query.searchFrom(func, Call)) {
                if (c.astId === call.astId) {
                    inChain = true;
                    break;
                }
            }
        }

        if (!inChain) {
            this.logWarning(`Call ${call.name}() has no ancestor function ${targetPoint.name}()`);
            return false;
        }
        return true;
    }

    protected abstract hoist(call: Call, targetPoint: FunctionJp): boolean;
}
