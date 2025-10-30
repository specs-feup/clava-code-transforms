import { BinaryOp, Call, Decl, Expression, ExprStmt, FunctionJp, ReturnStmt, Statement, TagType, Type, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Inliner from "@specs-feup/clava/api/clava/code/Inliner.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import NormalizeToSubset from "@specs-feup/clava/api/clava/opt/NormalizeToSubset.js";

export class AllocatorInliner extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("AllocatorInliner", silent);
    }

    public findAllAllocatorFunctions(): FunctionJp[] {

        const funs = [];

        for (const fun of Query.search(FunctionJp)) {
            // Return type must be a struct pointer
            if (!this.isStructPointer(fun.returnType)) {
                continue;
            }

            // must have exactly one allocator call to a declared pointer
            const assignedPointer = this.getDeclOfAlloc(fun) as Vardecl;
            if (!assignedPointer) {
                continue;
            }
            funs.push(fun);
            this.log(`Found allocator function ${fun.name} with return ${assignedPointer.type.code} ${assignedPointer.name}`);
        }
        return funs;
    }

    public inlineAllocatorFunction(fun: FunctionJp): number {
        const calls = Query.search(Call, (c) => c.name === fun.name).get();
        this.log(`Inlining ${calls.length} calls to allocator function ${fun.name}`);

        let cnt = 0;
        for (const call of calls) {
            const ok = this.inlineCall(call, fun);
            if (ok) {
                cnt++;
            }
            else {
                this.logWarning(`Failed to inline call to allocator function ${fun.name} at ${call.location}`);
            }
        }
        return calls.length;
    }

    private getDeclOfAlloc(fun: FunctionJp): Decl | null {
        const allocatorNames = ["malloc", "calloc"];
        const allocators = Query.searchFrom(fun, Call, (c) => allocatorNames.includes(c.name)).get();
        if (allocators.length == 1) {
            const call = allocators[0];

            // return of allocation must assign to a variable
            const assign = call.getAncestor("binaryOp") as BinaryOp;
            if (!assign || assign.operator !== "=") {
                return null;
            }
            const lhs = assign.left;
            // we may have multiple varrefs in the lhs, one of them ought to match the return varref
            const varrefs = Query.searchFromInclusive(lhs, Varref).get();

            const returnStmts = Query.searchFrom(fun.body, ReturnStmt).get();
            if (returnStmts.length === 0) {
                return null;
            }
            const returnVarrefs = [];
            for (const returnStmt of returnStmts) {
                returnVarrefs.push(...Query.searchFromInclusive(returnStmt, Varref).get());
            }

            // check if any of the return varrefs matches any of the lhs varrefs
            for (const retVarref of returnVarrefs) {
                for (const lhsVarref of varrefs) {
                    if (retVarref.name === lhsVarref.name) {
                        return lhsVarref.decl;
                    }
                }
            }
        }
        return null;
    }

    private inlineCall(call: Call, fun: FunctionJp): boolean {
        const normalized = this.ensureCallIsNormalized(call);
        if (!normalized) {
            return false;
        }
        const parentStmt = call.getAncestor("statement") as Statement;
        const assignment = Query.searchFromInclusive(parentStmt, BinaryOp, (b) => b.operator === "=").first();
        if (!assignment) {
            this.logError(`Could not find assignment statement for allocator call at ${call.location}`);
            return false;
        }
        const outerVarref = Query.searchFromInclusive(assignment.left, Varref).first();
        if (!outerVarref) {
            this.logError(`Could not find variable reference on LHS of assignment for allocator call at ${call.location}`);
            return false;
        }

        const lineNo = call.line;
        const cloneName = `${fun.name}_${lineNo}`;
        const clone = fun.clone(cloneName);

        const stmts = this.transformStatements(outerVarref, call, clone);
        for (const stmt of stmts) {
            parentStmt.insertBefore(stmt);
        }

        parentStmt.detach();
        clone.detach();
        return true;
    }

    private ensureCallIsNormalized(jp: Call | FunctionJp): boolean {
        const actionPoint = (jp instanceof Call) ? jp.getAncestor("statement") as Statement : jp;
        try {
            NormalizeToSubset(actionPoint);
            return true;
        } catch (e) {
            if (jp instanceof Call) {
                this.logWarning(`Failed to normalize call at ${actionPoint.location}`);
            }
            if (jp instanceof FunctionJp) {
                this.logWarning(`Failed to normalize function ${jp.name}`);
            }
            return false;
        }
    }

    private transformStatements(outerVarref: Varref, call: Call, fun: FunctionJp): Statement[] {
        const transformedStmts: Statement[] = [];
        const id = `_i${call.line}`;
        const innerDecl = this.getDeclOfAlloc(fun) as Vardecl;
        if (!innerDecl) {
            this.logError(`Could not find declaration assigned to allocator call in function ${fun.name}`);
            return transformedStmts;
        }

        const argsToParams = new Map<string, Expression>();
        for (let i = 0; i < fun.params.length; i++) {
            const param = fun.params[i];
            const arg = call.args[i];
            argsToParams.set(param.name, arg);
        }

        for (const varref of Query.searchFrom(fun.body, Varref)) {
            if (argsToParams.has(varref.name)) {
                const arg = argsToParams.get(varref.name)!;
                varref.replaceWith(arg.deepCopy());
            }
            else if (varref.name === innerDecl.name) {
                varref.setName(outerVarref.name);
            }
            else if (varref.isFunctionCall) {
                continue;
            }
            else {
                // rename local variables to avoid name clashes
                const newName = `${varref.name}${id}`;
                varref.setName(newName);
            }
        }

        for (const vardecl of Query.searchFrom(fun.body, Vardecl).get()) {
            if (vardecl.name === innerDecl.name) {
                const parentStmt = vardecl.getAncestor("statement") as Statement;
                parentStmt.detach();
            }
            else {
                vardecl.setName(`${vardecl.name}${id}`);
            }
        }

        for (const stmt of fun.body.stmts) {
            if (stmt instanceof ReturnStmt) {
                continue;
            }
            transformedStmts.push(stmt);
        }
        return transformedStmts;
    }
}