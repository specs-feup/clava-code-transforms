import { ArrayAccess, BinaryOp, Call, ExprStmt, Literal, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

interface ExpressionType {
    propagateInExprType(stmt: ExprStmt, varName: string, lit: Literal): [boolean, number, boolean];
}

export class ExpressionPropagation {
    constructor() { }

    public propagate(stmt: ExprStmt, varName: string, lit: Literal): [number, boolean] {
        const exprTypes: ExpressionType[] = [
            new ExprSimpleAssignment(),
            new ExprArithmeticAssignment(),
            new ExprLiteralAssignment(),
            new ExprArrayAssignment(),
            new ExprCall()
        ];

        let atLeastOneMatch = false;
        let replacements = 0;
        let canContinue = true;

        for (const exprType of exprTypes) {
            const result = exprType.propagateInExprType(stmt, varName, lit);

            if (result[0]) {
                atLeastOneMatch = true;
                replacements += result[1];
                canContinue = canContinue && result[2];
            }
        }
        if (!atLeastOneMatch) {
            console.log("[ExpressionPropagation] No match for statement " + stmt.code.replace(/\n/g, " "));
        }
        return [replacements, canContinue];
    }
}

// Expression type: foo = var, var = foo, foo[] = var;
class ExprSimpleAssignment implements ExpressionType {
    propagateInExprType(stmt: ExprStmt, varName: string, lit: Literal): [boolean, number, boolean] {
        if (stmt.children[0] instanceof BinaryOp && stmt.children[0].kind == "assign") {
            const op = stmt.children[0] as BinaryOp;

            if (op.right instanceof Varref && op.left instanceof Varref) {
                const leftVarref = op.left as Varref;
                const rightVarref = op.right as Varref;

                if (rightVarref.name === varName && leftVarref.name !== varName) {
                    rightVarref.replaceWith(lit.copy());
                    return [true, 1, true];   // foo = var;
                }
                else if (rightVarref.name === varName) {
                    return [true, 0, false];  // var = _;
                }
                else {
                    return [true, 0, true];   // _ = _;
                }
            }
            else if (op.right instanceof Varref && op.left instanceof ArrayAccess) {
                const rightVarref = op.right as Varref;

                if (rightVarref.name === varName) {
                    rightVarref.replaceWith(lit.copy());
                    return [true, 1, true];  // foo[] = var;
                }
            }
        }
        return [false, 0, true];
    }
}

// Expression type: a = b op *;
class ExprArithmeticAssignment implements ExpressionType {
    propagateInExprType(stmt: ExprStmt, varName: string, lit: Literal): [boolean, number, boolean] {
        if (stmt.children[0] instanceof BinaryOp && stmt.children[0].kind == "assign") {
            const op = stmt.children[0] as BinaryOp;

            if (op.left instanceof Varref && op.right instanceof BinaryOp) {
                const subOperand = op.right as BinaryOp;
                let replacements = 0;

                const toReplace: Varref[] = [];
                for (const varref of Query.searchFrom(subOperand, Varref, { name: varName })) {
                    toReplace.push(varref);
                    replacements++;
                }
                toReplace.forEach((varref) => { varref.replaceWith(lit); });

                return [true, replacements, true];
            }
        }
        return [false, 0, true];
    }
}

// Expression type: a = lit;
class ExprLiteralAssignment implements ExpressionType {
    propagateInExprType(stmt: ExprStmt, varName: string, lit: Literal): [boolean, number, boolean] {
        if (stmt.children[0] instanceof BinaryOp && stmt.children[0].kind == "assign") {
            const op = stmt.children[0] as BinaryOp;

            if (op.left instanceof Varref && op.right instanceof Literal) {
                const leftVarref = op.left as Varref;
                if (leftVarref.name === varName) {
                    return [true, 0, false];
                }
                else {
                    return [true, 0, true];
                }
            }
        }
        return [false, 0, true];
    }
}

// Expression type: a[var][var][...] = _
class ExprArrayAssignment implements ExpressionType {
    propagateInExprType(stmt: ExprStmt, varName: string, lit: Literal): [boolean, number, boolean] {
        if (stmt.children[0] instanceof BinaryOp && stmt.children[0].kind == "assign") {
            const op = stmt.children[0] as BinaryOp;

            if (op.left instanceof ArrayAccess) {
                const arrayAccess = op.left as ArrayAccess;
                const leftVarref = arrayAccess.children[0] as Varref;
                const indexes = arrayAccess.children.slice(1);
                let replacements = 0;

                if (leftVarref.name === varName) {
                    return [true, 0, false];
                }
                else {
                    for (const index of indexes) {
                        if (index instanceof Varref && index.name === varName) {
                            index.replaceWith(lit.copy());
                            replacements++;
                        }
                    }
                    return [true, replacements, true];
                }
            }
        }
        return [false, 0, true];
    }
}

class ExprCall implements ExpressionType {
    propagateInExprType(stmt: ExprStmt, varName: string, lit: Literal): [boolean, number, boolean] {
        if (stmt.children[0] instanceof Call) {
            const call = stmt.children[0] as Call;
            let replacements = 0;

            for (const arg of call.args) {
                if (arg instanceof Varref && arg.name === varName) {
                    arg.replaceWith(lit.copy());
                    replacements++;
                }
                if (arg instanceof ArrayAccess) {
                    const arrayAccess = arg as ArrayAccess;
                    const indexes = arrayAccess.children.slice(1);

                    for (const index of indexes) {
                        if (index instanceof Varref && index.name === varName) {
                            index.replaceWith(lit.copy());
                            replacements++;
                        }
                    }
                }
            }
            return [true, replacements, true];
        }
        return [false, 0, true];
    }
}