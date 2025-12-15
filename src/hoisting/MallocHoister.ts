import { BinaryOp, Call, ExprStmt, FileJp, FunctionJp, WrapperStmt } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AHoister } from "./AHoister.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { CallTreeInliner } from "../function/CallTreeInliner.js";
import IdGenerator from "@specs-feup/lara/api/lara/util/IdGenerator.js";

export class MallocHoister extends AHoister {

    constructor(silent: boolean = false) {
        super(silent, "MallocHoister");
    }

    public hoistAllMallocs(targetPoint?: FunctionJp, skipInlining: boolean = false): number {
        let actualPoint = this.getTargetPoint(targetPoint);
        if (actualPoint == undefined) {
            this.logError("No valid target point found for malloc hoisting.");
            return 0;
        }
        const actualPointName = actualPoint.name;
        if (!skipInlining) {
            this.inlineAll(actualPoint);
            // inlineAll rebuilds the AST, so we need to get the target point again
            actualPoint = this.getTargetPoint(actualPointName);
            if (actualPoint == undefined) {
                this.logError("No valid target point found for malloc hoisting after inlining.");
                return 0;
            }
        }

        const calls = Query.searchFrom(actualPoint, Call, (c) => c.name === "malloc" || c.name === "calloc").get();
        let hoistedCount = 0;
        let nonHoistedCount = 0;

        this.logLine();
        for (const call of calls) {
            const hoisted = this.hoistMalloc(call, actualPoint, false);

            if (hoisted) {
                this.log(`Successfully hoisted malloc() at function ${actualPoint.name}:${call.line}`);
                this.logLine();
                hoistedCount++;
            } else {
                this.log(`Could not hoist malloc() at function ${actualPoint.name}:${call.line}`);
                this.logLine();
                nonHoistedCount++;
            }
        }
        const removedFrees = this.removeFrees(actualPoint);
        this.removeRedundantFunctionDecls(actualPoint);

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

        // build param
        const id = IdGenerator.next("memregion_");
        const size = this.getSize(call);
        const dummyName = `${id}_size${size}`;
        const lhs = assignment.left;
        const type = lhs.type;
        const newParam = ClavaJoinPoints.param(dummyName, type);
        targetPoint.setParams([...targetPoint.params, newParam]);

        // update malloc assignment to use the param instead
        const newVarref = newParam.varref();
        assignment.right.replaceWith(newVarref);

        // update every call to parentFun to have the hoisted malloc just before
        const callsToParent = Query.search(Call, { name: targetPoint.name }).get();
        for (const call of callsToParent) {
            const callExpr = call.parent as ExprStmt;

            const mallocExprStr = `(${type.code}) malloc(${size})`;
            const mallocExpr = ClavaJoinPoints.exprLiteral(mallocExprStr, type);
            const pointerDecl = ClavaJoinPoints.varDecl(dummyName, mallocExpr);
            const declStmt = ClavaJoinPoints.declStmt(pointerDecl)
            callExpr.insertBefore(declStmt);

            // update call
            const newArg = ClavaJoinPoints.varRef(dummyName, type);
            call.addArg(newArg.code, newArg.type);

            // TODO: add free() after the call
        }
        return true;
    }

    private removeRedundantFunctionDecls(targetFun: FunctionJp): void {
        const allFuns = Query.search(FunctionJp, (f) => f.name === targetFun.name).get();
        allFuns.forEach((fun) => {
            if (!fun.isImplementation) {
                fun.detach();
                this.log(`Removed old declaration of ${fun.name}() at ${fun.filename}:${fun.line}.`);
            }
        });

        const newDecl = ClavaJoinPoints.stmtLiteral(`${targetFun.getDeclaration(true)};`);
        const file = targetFun.getAncestor("file") as FileJp;
        const firstFun = Query.searchFrom(file, FunctionJp).first();
        if (firstFun) {
            firstFun.insertBefore(newDecl);
            this.log(`Inserted new declaration of ${targetFun.name}() at ${file.filename}.`);
        }
    }


    private getSize(call: Call): number {
        const stmt = call.getAncestor("exprStmt") as ExprStmt;
        const prevSibling = stmt.siblingsLeft.at(-1);
        if (prevSibling != null && (prevSibling instanceof WrapperStmt)) {
            const pragma = prevSibling.code;
            const match = pragma.match(/\bmax\s*=\s*(\d+)/);
            return match ? Number(match[1]) : 16;
        }
        else {
            return 16;
        }
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