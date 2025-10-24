import { BinaryOp, Call, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { CallHoister } from "./CallHoister.js";
import { AHoister } from "./AHoister.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";

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

        this.logLine();
        for (const call of calls) {
            const parentFun = call.getAncestor("function") as FunctionJp;
            const hoisted = this.hoistMalloc(call, targetPoint);

            if (hoisted) {
                hoistedCount++;
                this.log(`Successfully hoisted malloc() at function ${parentFun.name}:${call.line}`);
            } else {
                this.log(`Failed to hoist malloc() at function ${parentFun.name}:${call.line}`);
            }
            this.logLine();
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
        const assignment = call.getAncestor("binaryOp") as BinaryOp;
        if (assignment == undefined) {
            this.logError(`Malloc/calloc call ${call.code} is not assigned to any variable.`);
            return false;
        }
        const parentFun = call.getAncestor("function") as FunctionJp;
        const dummyName = `memregion_${parentFun.name}_${call.line}`;

        const lhs = assignment.left;
        const type = lhs.type;
        const newVarDecl = ClavaJoinPoints.varDeclNoInit(dummyName, type);
        parentFun.insertBefore(newVarDecl);

        const newVarref = newVarDecl.varref();
        assignment.right.replaceWith(newVarref);

        return true;
    }
}
