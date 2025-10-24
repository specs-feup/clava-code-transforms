import { Call, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AHoister } from "./AHoister.js";

export abstract class CallHoister extends AHoister {
    constructor(silent: boolean = false, name: string = "CallHoister") {
        super(silent, name);
    }

    public hoistAll(callSignature: string, targetPoint?: FunctionJp): number {
        targetPoint = this.getTargetPoint(targetPoint);
        if (targetPoint == undefined) {
            return 0;
        }

        let hoistedCount = 0;
        const calls = Query.search(Call, { signature: callSignature }).get();

        for (const call of calls) {
            const hoisted = this.hoist(call, targetPoint);
            if (hoisted) {
                hoistedCount++;
                this.log(`Successfully hoisted call ${call.code}`);
            } else {
                this.log(`Failed to hoist call ${call.code}`);
            }
        }
        return hoistedCount;
    }

    public hoistCall(call: Call, targetPoint: FunctionJp): boolean {
        const canHoist = this.verifyHoistConditions(call, targetPoint);
        if (!canHoist) {
            return false;
        }

        return this.hoist(call, targetPoint);
    }

    protected hoist(call: Call, targetPoint: FunctionJp): boolean {
        return true;
    }
}
