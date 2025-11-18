import { BuiltinType, Call, ExprStmt, FileJp, FunctionJp, Param, QualType, Statement, TypedefType, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { Inliner } from "./Inliner.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";

export class CallTreeInliner extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("CallTreeInliner", silent);
    }

    public inlineCallTree(topLevelFunction: FunctionJp, removeInlined: boolean = false, prefix: string = "_i"): boolean {
        let isChanging = true;
        let totalInlined = 0;
        const inlinedFuns: Set<FunctionJp> = new Set();

        const inliner = new Inliner(true);
        this.log(`Starting call tree inlining from function ${topLevelFunction.name}`);

        while (isChanging) {
            isChanging = false;
            const calls = Query.searchFrom(topLevelFunction, Call).get();

            for (const call of calls) {
                if (!call.function.isImplementation) {
                    continue;
                }

                const inlineOk = inliner.inline(call, prefix);

                if (inlineOk) {
                    isChanging = true;
                    totalInlined++;
                    inlinedFuns.add(call.function);
                    this.log(`  Inlined call to function ${call.function.name}()`);
                }
                else {
                    this.logWarning(`  Failed to inline call to function ${call.function.name} at ${call.location}`);
                }
            }
        }
        this.log(`Inlined a total of ${totalInlined} function calls in the call tree of function ${topLevelFunction.name}.`);

        if (removeInlined) {
            this.removeInlinedFunctions(topLevelFunction, inlinedFuns);
        }
        this.sanitizeInlinedRegion(topLevelFunction);
        return this.rebuildAfterTransform();
    }

    public revertGlobalsToParams(fun: FunctionJp): boolean {
        // remove assignments to global variables at start and end of function
        const stmtsToRemove = [];
        for (const varref of Query.searchFrom(fun, Varref, (v) => v.name.startsWith("global_")).get()) {
            const assignStmt = varref.getAncestor("statement") as Statement;
            stmtsToRemove.push(assignStmt);
        }
        if (stmtsToRemove.length === 0) {
            return false;
        }
        stmtsToRemove.forEach((s) => s.replaceWith(ClavaJoinPoints.stmtLiteral(`//${s.code} // Removed by CallTreeInliner`)));
        this.log(`Reverted ${stmtsToRemove.length} global variable assignments to function parameters in function ${fun.name}.`);

        const globalParams = fun.params.filter((p) => p.name.startsWith("global_"));
        this.log(`Found ${globalParams.length} global parameters to revert to pointers.`);

        // change scalar params to pointer params
        const modifiedIdx: number[] = [];
        for (let i = 0; i < globalParams.length; i++) {
            const param = globalParams[i];
            if (param.type instanceof BuiltinType || param.type instanceof QualType || param.type instanceof TypedefType) {
                const newType = ClavaJoinPoints.pointer(param.type);
                this.log(`  Changing parameter ${param.name} type from ${param.type.code} to ${newType.code}`);
                param.setType(newType);
                modifiedIdx.push(i);
            }
            param.setName(param.name.replace("global_", ""));
        };
        // change all varrefs to deref of param
        globalParams.forEach((p) => {
            for (const varref of Query.searchFrom(fun, Varref, (v) => v.name === p.name).get()) {
                if (varref.type.isPointer) {
                    continue;
                }
                const newVarref = ClavaJoinPoints.varRef(p);
                const deref = ClavaJoinPoints.unaryOp("*", newVarref);
                const parenthesis = ClavaJoinPoints.parenthesis(deref);
                varref.replaceWith(parenthesis);
            }
        });
        // update args in calls to function based on changed params
        for (const call of Query.search(Call, (c) => c.function.name === fun.name).get()) {
            for (let i = 0; i < call.args.length; i++) {
                const arg = call.args[i];
                if (arg.type.isPointer) {
                    continue;
                }
                const parenthesis = ClavaJoinPoints.parenthesis(arg);
                const addrOf = ClavaJoinPoints.unaryOp("&", parenthesis);
                call.setArg(i, addrOf);
                this.log(`    Updated argument ${addrOf.code} (${i}) in call at ${call.location}`);
            }
            this.log(`  Updated call to function ${call.function.name} at ${call.location}`);
        }
        // update function declarations
        for (const funDecl of Query.search(FunctionJp, (f) => f.name === fun.name && !f.isImplementation).get()) {
            const sig = fun.getDeclaration(true);
            const stmt = ClavaJoinPoints.stmtLiteral(`${sig};`);
            funDecl.replaceWith(stmt);
            this.log(`  Updated function declaration for ${funDecl.name}`);
        }
        this.log(`Reverted global parameters to pointers in function ${fun.name}.`);
        return true;
    }

    private removeInlinedFunctions(clusterFun: FunctionJp, inlinedFuns: Set<FunctionJp>): void {
        const file = clusterFun.getAncestor("file") as FileJp;
        if (!file) {
            this.logWarning(`Could not find ancestor file for function ${clusterFun.name}. Skipping removal of inlined functions.`);
            return;
        }

        const funNames = Array.from(inlinedFuns).map((f) => f.name);
        let nImpl = 0;
        let nDecl = 0;
        for (const fun of Query.searchFrom(file, FunctionJp).get()) {
            if (funNames.includes(fun.name)) {
                fun.detach();
                if (fun.isImplementation) {
                    nImpl++;
                }
                else {
                    nDecl++;
                }
            }
        }
        this.log(`Removed ${nImpl} inlined function implementations`);
        this.log(`Removed ${nDecl} inlined function declarations`);
    }

    private sanitizeInlinedRegion(fun: FunctionJp): void {
        const stmts = Query.searchFrom(fun, Statement).get();
        const inliner = new Inliner(true);

        for (const stmt of stmts) {
            inliner.santitizeStatement(stmt);
        }

        this.log(`Sanitized inlined regions in function ${fun.name}.`);
    }
}