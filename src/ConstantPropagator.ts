import Query from "@specs-feup/lara/api/weaver/Query.js";
import { BinaryOp, DeclStmt, ExprStmt, FunctionJp, If, Literal, Loop, ReturnStmt, Scope, Statement, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js"

export default class ConstantPropagator {
    private fun: FunctionJp;

    constructor(fun: FunctionJp) {
        this.fun = fun;
    }

    public doPass(): number {
        let replacements = 0;

        const body = this.fun.body;
        for (const stmt of body.stmts) {
            if (this.isSimpleAssignment(stmt)) {
                const region = this.getPostAssignmentRegion(stmt, body.stmts);
                replacements += this.propagateInRegion(region, stmt);
            }
        }
        return replacements;
    }

    private isSimpleAssignment(stmt: Statement): boolean {
        if (stmt instanceof DeclStmt) {
            const cond1 = stmt.children[0] instanceof Vardecl;
            const cond2 = stmt.children[0].children[0] instanceof Literal;

            return cond1 && cond2;
        }
        if (stmt instanceof ExprStmt) {
            const cond1 = stmt.children[0] instanceof BinaryOp && stmt.children[0].kind == "assign";
            const cond2 = (stmt.children[0] as BinaryOp).left instanceof Varref;
            const cond3 = (stmt.children[0] as BinaryOp).right instanceof Literal;

            return cond1 && cond2 && cond3;
        }
        return false;
    }

    private getPostAssignmentRegion(stmt: Statement, stmts: Statement[]): Statement[] {
        const region: Statement[] = [];

        let found = false;
        for (const postStmt of stmts) {
            if (postStmt.astId === stmt.astId) {
                found = true;
                continue;
            }
            if (found) {
                region.push(postStmt);
            }
        }
        return region;
    }

    private propagateInRegion(region: Statement[], stmt: Statement): number {
        let replacements = 0;
        let varName: string = "";
        let lit: Literal;

        if (stmt instanceof DeclStmt) {
            varName = (stmt.children[0] as Vardecl).name;
            lit = (stmt.children[0].children[0] as Literal);
        }
        else if (stmt instanceof ExprStmt) {
            const op = stmt.children[0] as BinaryOp;
            varName = (op.left as Varref).name;
            lit = op.right as Literal;
        }
        else {
            return replacements;
        }

        for (const postStmt of region) {
            const [replaced, canContinue] = this.propagate(postStmt, varName, lit);
            replacements += replaced;
            if (!canContinue) {
                break;
            }
        }

        return replacements;
    }

    private propagate(stmt: Statement, varName: string, lit: Literal): [number, boolean] {
        if (stmt instanceof ExprStmt) {
            return this.propagateInExpr(stmt, varName, lit);
        }
        else if (stmt instanceof DeclStmt) {
            return this.propagateInDecl(stmt, varName, lit);
        }
        else if (stmt instanceof ReturnStmt) {
            return this.propagateInReturn(stmt, varName, lit);
        }
        else if (stmt instanceof If) {
            return this.propagateInIf(stmt, varName, lit);
        }
        else if (stmt instanceof Loop) {
            return this.propagateInLoop(stmt, varName, lit);
        }
        else {
            console.log(`[ConstantPropagator] Unsupported statement type: ${stmt.constructor.name}`);
            return [0, true];
        }
    }

    private propagateInExpr(stmt: ExprStmt, varName: string, lit: Literal): [number, boolean] {
        // Expr structure: a = expr;
        if (stmt.children[0] instanceof BinaryOp && stmt.children[0].kind == "assign") {
            const op = stmt.children[0] as BinaryOp;

            // Expression type: a = b;
            if (op.right instanceof Varref && op.left instanceof Varref) {
                const leftVarref = op.left as Varref;
                const rightVarref = op.right as Varref;

                if (rightVarref.name === varName && leftVarref.name !== varName) {
                    op.replaceWith(lit);
                    return [1, true];   // foo = var;
                }
                else if (rightVarref.name === varName) {
                    return [0, false];  // var = _;
                }
                else {
                    return [0, true];   // _ = _;
                }
            }
            // Expression type: a = b op *;
            else if (op.left instanceof Varref && op.right instanceof BinaryOp) {
                const subOperand = op.right as BinaryOp;
                let replacements = 0;

                const toReplace: Varref[] = [];
                for (const varref of Query.searchFrom(subOperand, Varref, { name: varName })) {
                    toReplace.push(varref);
                    replacements++;
                }
                toReplace.forEach((varref) => { varref.replaceWith(lit); });

                return [replacements, true];
            }
            // Expression type: a = lit;
            else if (op.left instanceof Varref && op.right instanceof Literal) {
                const leftVarref = op.left as Varref;
                if (leftVarref.name === varName) {
                    return [0, false];
                }
                else {
                    return [0, true];
                }
            }
            // Expression type: idk
            else {
                console.log(`[ConstantPropagator] Unsupported ExprStmt type: ${stmt.code}`);
                return [0, true];
            }

        }
        // Expr type: all others not yet implemented
        else {
            console.log(`[ConstantPropagator] Unsupported ExprStmt structure: ${stmt.code}`);
            return [0, true];
        }
    }

    private propagateInDecl(stmt: DeclStmt, varName: string, lit: Literal): [number, boolean] {

        return [0, true];
    }

    private propagateInReturn(stmt: ReturnStmt, varName: string, lit: Literal): [number, boolean] {

        return [0, true];
    }

    private propagateInIf(stmt: If, varName: string, lit: Literal): [number, boolean] {

        return [0, true];
    }

    private propagateInLoop(stmt: Loop, varName: string, lit: Literal): [number, boolean] {

        return [0, true];
    }
}