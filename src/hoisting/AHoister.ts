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
        let parentFun = call.getAncestor("function") as FunctionJp;
        let canHoist = false;
        do {
            if (parentFun.astId === targetPoint.astId) {
                canHoist = true;
                break;
            }
        } while (parentFun != null);
        if (!canHoist) {
            this.logError(`Cannot hoist call ${call.code} to function ${targetPoint.name} as it is not an ancestor.`);
            return false;
        }
        return true;
    }

    protected abstract hoist(call: Call, targetPoint: FunctionJp): boolean;
}
