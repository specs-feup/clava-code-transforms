import { Body, FunctionJp, If, Loop, Scope, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

export class ScopeFlattener extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("ScopeFlattener", silent);
    }

    public flattenScope(scope: Scope, prefix: String): boolean {
        for (const decl of Query.searchFrom(scope, Vardecl)) {
            const newName = `${prefix}_${decl.name}`;

            for (const ref of Query.searchFrom(scope, Varref, { name: decl.name })) {
                ref.name = newName
            }
            decl.name = newName;
        }
        for (const child of scope.children) {
            scope.insertBefore(child);
        }
        scope.detach();
        return true;
    }

    public flattenAllInFunction(fun: FunctionJp, prefix: string = "_scope"): number {
        let n = 0;
        for (const scope of Query.searchFrom(fun, Scope)) {
            if (!this.isRedundant(scope)) {
                continue;
            }
            this.flattenScope(scope, `${prefix}_${n}`);
            n++;
        }
        return n;
    }

    public isRedundant(scope: Scope): boolean {
        return scope.joinPointType !== "body";
    }
}