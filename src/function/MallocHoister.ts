import { Call, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { CallHoister } from "./CallHoister.js";
import { AHoister } from "./AHoister.js";

export class MallocHoister extends AHoister {

    constructor(silent: boolean = false) {
        super(silent, "MallocHoister");
    }

    public hoistAllMallocs(targetPoint?: FunctionJp): number {
        targetPoint = this.getTargetPoint(targetPoint);
        if (targetPoint == undefined) {
            return 0;
        }

        const calls = Query.search(Call, (c) => c.name === "malloc" || c.name === "calloc").get();
        let hoistedCount = 0;

        for (const call of calls) {
            const hoisted = this.hoistMalloc(call, targetPoint);
            if (hoisted) {
                hoistedCount++;
                this.log(`Successfully hoisted call ${call.code}`);
            } else {
                this.log(`Failed to hoist call ${call.code}`);
            }
        }
        return hoistedCount;
    }

    public hoistMalloc(call: Call, targetPoint: FunctionJp): boolean {
        const canHoist = this.verifyHoistConditions(call, targetPoint);
        if (!canHoist) {
            return false;
        }

        if (!(call.name === "malloc") && !(call.name === "calloc")) {
            this.logError(`Call ${call.code} is not a malloc/calloc call.`);
            return false;
        }

        return this.hoist(call, targetPoint);
    }

    protected hoist(call: Call, targetPoint: FunctionJp): boolean {


        return true;
    }
}
