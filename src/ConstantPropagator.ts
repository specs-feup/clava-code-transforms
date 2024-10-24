import Query from "@specs-feup/lara/api/weaver/Query.js";
import { ArrayAccess, BinaryOp, DeclStmt, ExprStmt, FunctionJp, If, Literal, Loop, ReturnStmt, Statement, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import { ExpressionPropagation } from "./constfolding/ExpressionPropagation.js";

interface PropagationPass {
    doPass(): number;
}

export class GlobalConstantPropagator implements PropagationPass {
    constructor() { }

    public doPass(): number {
        let replacements = 0;
        const globalVars = this.getGlobalVars();
        const constGlobals = this.getConstantGlobals(globalVars);

        for (const [name, lit] of constGlobals.entries()) {
            replacements += this.replaceRefs(name, lit);
        }

        return replacements;
    }

    private getGlobalVars(): Map<string, Literal> {
        const globalVars: Map<string, Literal> = new Map();

        for (const vardecl of Query.search(Vardecl)) {
            if (vardecl.children.length == 0 || !vardecl.isGlobal) {
                continue;
            }

            if (vardecl.children[0] instanceof Literal) {
                const lit = vardecl.children[0] as Literal;

                globalVars.set(vardecl.name, lit);
            }
        }
        return globalVars;
    }

    private getConstantGlobals(globalVars: Map<string, Literal>): Map<string, Literal> {
        const constGlobals: Map<string, Literal> = new Map();

        for (const [name, value] of globalVars.entries()) {
            let changed = false;

            for (const varref of Query.search(Varref, { name: name })) {
                changed = this.isAssignment(varref);
            }
            if (!changed) {
                constGlobals.set(name, value);
            }
        }
        return constGlobals;
    }

    private isAssignment(varref: Varref): boolean {
        const parentOp = varref.getAncestor("binaryOp") as BinaryOp;
        if (parentOp == undefined) {
            return false;
        }
        if (parentOp.kind != "assign") {
            return false;
        }
        if (varref.parent instanceof ArrayAccess) {
            return false;
        }

        const isOnRight = Query.searchFrom(parentOp.right, Varref, { name: varref.name }).first() != null;
        if (isOnRight) {
            return false;
        }

        return false;
    }

    private replaceRefs(name: string, literal: Literal): number {
        const toReplace: Varref[] = [];

        for (const varref of Query.search(Varref, { name: name })) {
            toReplace.push(varref);
        }

        for (const varref of toReplace) {
            varref.replaceWith(literal.copy());
        }
        return toReplace.length;
    }
}

export class FunctionConstantPropagator implements PropagationPass {
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
        const exprProp = new ExpressionPropagation();
        return exprProp.propagate(stmt, varName, lit);
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