import { BinaryOp, Call, ExprStmt, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AHoister } from "./AHoister.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { CallTreeInliner } from "../function/CallTreeInliner.js";

export class MallocHoister extends AHoister {

    constructor(silent: boolean = false) {
        super(silent, "MallocHoister");
    }

    public hoistAllMallocs(targetPoint?: FunctionJp): number {
        let actualPoint = this.getTargetPoint(targetPoint);
        if (actualPoint == undefined) {
            this.logError("No valid target point found for malloc hoisting.");
            return 0;
        }
        const actualPointName = actualPoint.name;
        this.inlineAll(actualPoint);

        // inlineAll rebuilds the AST, so we need to get the target point again
        actualPoint = this.getTargetPoint(actualPointName);
        if (actualPoint == undefined) {
            this.logError("No valid target point found for malloc hoisting after inlining.");
            return 0;
        }

        const calls = Query.search(Call, (c) => c.name === "malloc" || c.name === "calloc").get();
        let hoistedCount = 0;
        let nonHoistedCount = 0;

        this.logLine();
        for (const call of calls) {
            const parentFun = call.getAncestor("function") as FunctionJp;
            const hoisted = this.hoistMalloc(call, actualPoint, false);

            if (hoisted) {
                this.log(`Successfully hoisted malloc() at function ${parentFun.name}:${call.line}`);
                this.logLine();
                hoistedCount++;
            } else {
                nonHoistedCount++;
            }
        }

        const removedFrees = this.removeFrees(actualPoint);

        this.log(`MallocHoister Summary:`);
        this.log(`Total malloc/calloc calls found: ${calls.length}`);
        this.log(`Successfully hoisted: ${hoistedCount}`);
        this.log(`Not hoisted: ${nonHoistedCount}`);
        this.log(`Removed free() calls: ${removedFrees}`);
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

    private removeFrees(targetPoint: FunctionJp): number {
        const frees = Query.searchFrom(targetPoint, Call, (c) => c.name === "free").get();
        frees.forEach((freeCall) => {
            const exprStmt = freeCall.getAncestor("exprStmt") as ExprStmt;
            const comment = ClavaJoinPoints.comment(exprStmt.code);
            exprStmt.replaceWith(comment);
        });
        return frees.length;
    }

    private inlineAll(startingPoint: FunctionJp): boolean {
        const callTreeInliner = new CallTreeInliner();
        return callTreeInliner.inlineCallTree(startingPoint, true, "_i");
    }
}
