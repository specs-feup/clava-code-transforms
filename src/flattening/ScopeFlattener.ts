import { DeclStmt, FunctionJp, Scope, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import IdGenerator from "@specs-feup/lara/api/lara/util/IdGenerator.js";

export class ScopeFlattener extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("ScopeFlattener", silent);
    }

    public flattenScope(scope: Scope, prefix: string): number {
        let n = 0;
        const innerScopes: Scope[] = [];
        for (const child of scope.children) {
            if (child instanceof Scope) {
                if (!this.isRedundant(child)) {
                    continue;
                }
                innerScopes.push(child);
            }
        }
        innerScopes.forEach(innerScope => {
            n += this.flattenScope(innerScope, IdGenerator.next(prefix));
        });

        const decls: Vardecl[] = [];
        for (const child of scope.children) {
            if (child instanceof DeclStmt) {
                decls.push(...Query.searchFrom(child, Vardecl).get());
            }
        }

        for (const decl of decls) {
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
        return n + 1;
    }

    public flattenAllInFunction(fun: FunctionJp, prefix: string = "_scope"): number {
        let n = 0;
        if (fun.body === undefined) {
            return n;
        }
        const allScopes = Query.searchFrom(fun.body, Scope).get().filter(scope => this.isRedundant(scope));
        for (const scope of allScopes) {
            if (scope.parent !== undefined) {
                n += this.flattenScope(scope, IdGenerator.next(prefix));
            }
        }
        return n;
    }

    public isRedundant(scope: Scope): boolean {
        return scope.joinPointType !== "body";
    }
}