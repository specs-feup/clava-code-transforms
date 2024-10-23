import Query from "@specs-feup/lara/api/weaver/Query.js";
import { BinaryOp, FloatLiteral, FunctionJp, IntLiteral, Joinpoint, Literal, Param, Program, Statement, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import { LaraJoinPoint } from "@specs-feup/lara/api/LaraJoinPoint.js";
import JoinPoints from "@specs-feup/lara/api/weaver/JoinPoints.js";

export default class ConstantPropagator {
    constructor() { }

    public doPass(): number {
        let replacements = 0;

        for (const decl of Query.search(Vardecl)) {
            if (!decl.hasInit) {
                continue;
            }

            const init = decl.init;
            if (init instanceof Literal) {
                if (decl.isGlobal) {
                    console.log("Global constant propagation not implemented yet.");
                }
                else {
                    replacements += this.propagateConstantInFunction(decl, init);
                }
            }
        }
        return replacements;
    }

    private propagateConstantInFunction(decl: Vardecl, init: Literal): number {
        let replacements = 0;
        const stmt = decl.getAncestor("statement");
        const scope = stmt.getAncestor("scope");
        let valid = false;

        for (const stmt of scope.children) {
            if (!(stmt instanceof Statement)) {
                continue;
            }
            if (stmt.astId === decl.astId) {
                valid = true;
                continue;
            }
            if (valid) {
                for (const ref of Query.searchFrom(stmt, Varref, { "name": decl.name })) {
                    if (this.isUseNotDef(ref)) {
                        ref.replaceWith(init.copy());
                        replacements++;
                    }
                }
            }
        }
        return replacements;
    }

    private isUseNotDef(ref: Varref): boolean {
        if (ref.parent instanceof BinaryOp) {
            const op = ref.parent as BinaryOp;

            if (op.kind == "assign") {

            }
        }
        return true;
    }
}