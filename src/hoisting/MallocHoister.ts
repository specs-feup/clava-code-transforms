import { BinaryOp, Call, ExprStmt, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { CallHoister } from "./CallHoister.js";
import { AHoister } from "./AHoister.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import Inliner, { InlinerOptions } from "@specs-feup/clava/api/clava/code/Inliner.js";
import { CallTreeInliner } from "../function/CallTreeInliner.js";

export class MallocHoister extends AHoister {

    constructor(silent: boolean = false) {
        super(silent, "MallocHoister");
    }

    public hoistAllMallocs(targetPoint?: FunctionJp): number {
        targetPoint = this.getTargetPoint(targetPoint);
        if (targetPoint == undefined) {
            return 0;
        }
        this.inlineAll(targetPoint);

        const calls = Query.search(Call, (c) => c.name === "malloc" || c.name === "calloc").get();
        let hoistedCount = 0;
        let nonHoistedCount = 0;

        this.logLine();
        for (const call of calls) {
            const parentFun = call.getAncestor("function") as FunctionJp;
            const hoisted = this.hoistMalloc(call, targetPoint, false);

            if (hoisted) {
                this.log(`Successfully hoisted malloc() at function ${parentFun.name}:${call.line}`);
                this.logLine();
                hoistedCount++;
            } else {
                nonHoistedCount++;
            }
        }
        this.log(`MallocHoister Summary:`);
        this.log(`Total malloc/calloc calls found: ${calls.length}`);
        this.log(`Successfully hoisted: ${hoistedCount}`);
        this.log(`Not hoisted: ${nonHoistedCount}`);
        this.logLine();
        return hoistedCount;
    }

    public hoistMalloc(call: Call, targetPoint: FunctionJp, inlineTree: boolean = true): boolean {
        if (inlineTree) {
            this.inlineAll(targetPoint);
        }

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
        if (parentFun.name !== targetPoint.name) {
            this.logError(`Cannot hoist malloc/calloc call ${call.code} from function ${parentFun.name} to target function ${targetPoint.name}.`);
            return false;
        }
        // build param
        const dummyName = `memregion_${parentFun.name}_${call.line}`;
        const lhs = assignment.left;
        const type = lhs.type;
        const newParam = ClavaJoinPoints.param(dummyName, type);
        parentFun.setParams([...parentFun.params, newParam]);

        // update malloc assignment to use the param instead
        const newVarref = newParam.varref();
        assignment.right.replaceWith(newVarref);

        // update every call to parentFun to have the hoisted malloc just before
        const callsToParent = Query.search(Call, { name: parentFun.name }).get();
        for (const call of callsToParent) {
            const callExpr = call.parent as ExprStmt;

            // for now, we just declare the pointer. We'll implement the malloc later
            const pointerDecl = ClavaJoinPoints.varDeclNoInit(dummyName, type);
            const declStmt = ClavaJoinPoints.declStmt(pointerDecl)
            callExpr.insertBefore(declStmt);

            // update call
            const newArg = ClavaJoinPoints.varRef(dummyName, type);
            call.addArg(newArg.code, newArg.type);
        }

        return true;
    }

    private inlineAll(startingPoint: FunctionJp): boolean {
        const callTreeInliner = new CallTreeInliner();
        return callTreeInliner.inlineCallTree(startingPoint, true, "_i");
    }
}
