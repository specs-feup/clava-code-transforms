import { Call, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

export abstract class CallHoister extends AdvancedTransform {
    constructor(silent: boolean = false, name: string = "CallHoister") {
        super(name, silent);
    }

    public hoistAll(callSignature: string, startingPoint?: FunctionJp): number {
        if (startingPoint == undefined) {
            startingPoint = Query.search(FunctionJp, { name: "main" }).first();
            if (startingPoint == undefined) {
                this.logError("No starting point provided and 'main' function not found.");
                return 0;
            }
            else {
                this.log(`Starting point not provided. Using 'main' function as starting point.`);
            }
        }

        let hoistedCount = 0;
        const calls = Query.search(Call, { signature: callSignature }).get();

        for (const call of calls) {
            const hoisted = this.hoist(call, startingPoint);
            if (hoisted) {
                hoistedCount++;
                this.log(`Successfully hoisted call ${call.code}`);
            } else {
                this.log(`Failed to hoist call ${call.code}`);
            }
        }
        return hoistedCount;
    }

    public abstract hoist(call: Call, startingPoint: FunctionJp): boolean;
}
