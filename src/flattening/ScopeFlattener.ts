import { DeclStmt, FunctionJp, Scope, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import IdGenerator from "@specs-feup/lara/api/lara/util/IdGenerator.js";

export class ScopeFlattener extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("ScopeFlattener", silent);
    }

    public flattenScope(scope: Scope, usePrefix: boolean = true, prefix: string = "_scope"): number {
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
            n += this.flattenScope(innerScope, usePrefix, IdGenerator.next(prefix));
        });

        if (usePrefix) {
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
        }
        for (const child of scope.children) {
            scope.insertBefore(child);
        }
        scope.detach();
        return n + 1;
    }

    public flattenAllInFunction(fun: FunctionJp, usePrefix: boolean = true, prefix: string = "_scope"): number {
        let n = 0;
        if (fun.body === undefined) {
            return n;
        }
        let allScopes = Query.searchFrom(fun.body, Scope).get().filter(scope => this.isRedundant(scope));
        this.sortScopes(allScopes);

        for (const scope of allScopes) {
            if (scope.parent !== undefined) {
                n += this.flattenScope(scope, usePrefix, IdGenerator.next(prefix));
            }
        }
        return n;
    }

    public isRedundant(scope: Scope): boolean {
        return scope.joinPointType !== "body";
    }

    private sortScopes(scopes: Scope[]): void {
        scopes.sort((s1, s2) => {
            // if s1 is a descendant of s2, s1 > s2, return 1
            const cond1 = Query.searchFrom(s1, Scope).get().some(sc => {
                return sc.line === s2.line;
            });
            if (cond1) {
                return 1;
            }
            // if s2 is a descendant of s1, s1 < s2, return -1
            const cond2 = Query.searchFrom(s2, Scope).get().some(sc => {
                return sc.line === s1.line;
            });
            if (cond2) {
                return -1;
            }
            // otherwise, return 0
            return 0;
        });
    }
}