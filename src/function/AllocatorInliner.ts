import { BinaryOp, Call, ExprStmt, FunctionJp, ReturnStmt, TagType, Type, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Inliner from "@specs-feup/clava/api/clava/code/Inliner.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

export class AllocatorInliner extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("AllocatorInliner", silent);
    }

    public findAllAllocatorFunctions(): FunctionJp[] {
        const allocatorNames = ["malloc", "calloc"];
        const funs = [];

        for (const fun of Query.search(FunctionJp)) {
            // Return type must be a struct pointer
            if (!this.isStructPointer(fun.returnType)) {
                continue;
            }

            // must have exactly one allocator call
            const allocators = Query.searchFrom(fun, Call, (c) => allocatorNames.includes(c.name)).get();
            if (allocators.length == 1) {
                const call = allocators[0];

                // return of allocation must assign to a variable
                const assign = call.getAncestor("binaryOp") as BinaryOp;
                if (!assign || assign.operator !== "=") {
                    continue;
                }
                const lhs = assign.left;
                // we may have multiple varrefs in the lhs, one of them ought to match the return varref
                const varrefs = Query.searchFromInclusive(lhs, Varref).get();

                const returnStmt = Query.searchFrom(fun.body, ReturnStmt).get()[0];
                if (!returnStmt) {
                    continue;
                }
                const returnVarrefs = Query.searchFromInclusive(returnStmt, Varref).get();

                // check if any of the return varrefs matches any of the lhs varrefs
                for (const retVarref of returnVarrefs) {
                    for (const lhsVarref of varrefs) {
                        console.log(`Comparing return varref ${retVarref.name} with lhs varref ${lhsVarref.name}`);
                        if (retVarref.name === lhsVarref.name) {
                            funs.push(fun);
                            this.log(`Found allocator function: ${fun.name} with ${allocators} allocator calls.`);
                        }
                    }
                }
            }
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

    private inlineCall(call: Call, fun: FunctionJp): boolean {
        return true;
    }
}