import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { ArrayAccess, Expression, Statement, UnaryOp, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import { StructDecomposer, StructDecomposerUtil } from "./StructDecomposer.js";

export abstract class StructRefDecomposer {
    public abstract validate(leftRef: Varref, rightRef: Varref): boolean;

    public decompose(leftRef: Varref, rightRef: Varref, fieldDecls: [string, Vardecl][]): Statement[] {
        const newExprs: Statement[] = [];

        for (const [fieldName, fieldDecl] of fieldDecls) {
            const lhsVarName = `${leftRef.name}_${fieldName}`;
            const rhsVarName = `${rightRef.name}_${fieldName}`;

            const fieldExprs = this.decomposeField(leftRef, rightRef, fieldDecl, lhsVarName, rhsVarName);
            newExprs.push(...fieldExprs);
        }

        return newExprs;
    }

    protected abstract decomposeField(leftRef: Varref, rightRef: Varref, fieldDecl: Vardecl, lhsVarName: string, rhsVarName: string): Statement[];
}

export class ScalarToScalarAssignment extends StructRefDecomposer {
    validate(leftRef: Varref, rightRef: Varref): boolean {
        const lhsIsPointer = leftRef.type.isPointer;
        const lhsHasArrayAccess = leftRef.parent instanceof ArrayAccess;
        const rhsIsPointer = rightRef.type.isPointer;
        const rhsHasArrayAccess = rightRef.parent instanceof ArrayAccess;

        return !lhsIsPointer && !rhsIsPointer && !lhsHasArrayAccess && !rhsHasArrayAccess;
    }

    protected decomposeField(leftRef: Varref, rightRef: Varref, fieldDecl: Vardecl, lhsVarName: string, rhsVarName: string): Statement[] {
        const newExprs: Statement[] = [];

        if (fieldDecl.type.isArray) {
            const newLhs = ClavaJoinPoints.varRef(lhsVarName, fieldDecl.type);
            const newRhs = ClavaJoinPoints.varRef(rhsVarName, fieldDecl.type);
            const sizeof = ClavaJoinPoints.integerLiteral(fieldDecl.type.arraySize);
            const retType = ClavaJoinPoints.type("void*");
            const stmt = StructDecomposerUtil.generateMemcpy(newLhs, newRhs, sizeof);

            newExprs.push(stmt);
        }
        else {
            const newLhs = ClavaJoinPoints.varRef(lhsVarName, fieldDecl.type);
            const newRhs = ClavaJoinPoints.varRef(rhsVarName, fieldDecl.type);
            const assign = ClavaJoinPoints.binaryOp("=", newLhs, newRhs);
            const stmt = ClavaJoinPoints.exprStmt(assign);

            newExprs.push(stmt);
        }

        return newExprs;
    }
}

export class ArrayToArrayAssignment extends StructRefDecomposer {
    public validate(leftRef: Varref, rightRef: Varref): boolean {
        const lhsIsPointer = leftRef.type.isPointer;
        const lhsHasArrayAccess = leftRef.parent instanceof ArrayAccess;
        const rhsIsPointer = rightRef.type.isPointer;
        const rhsHasArrayAccess = rightRef.parent instanceof ArrayAccess;

        return !lhsIsPointer && !rhsIsPointer && lhsHasArrayAccess && rhsHasArrayAccess;
    }

    protected decomposeField(leftRef: Varref, rightRef: Varref, fieldDecl: Vardecl, lhsVarName: string, rhsVarName: string): Statement[] {
        const lhsArrayAccess = leftRef.parent as ArrayAccess;
        const newLhsVar = ClavaJoinPoints.varRef(lhsVarName, fieldDecl.type);
        const newLhs = lhsArrayAccess.copy() as ArrayAccess;
        newLhs.setFirstChild(newLhsVar);

        const rhsArrayAccess = rightRef.parent as ArrayAccess;
        const newRhsVar = ClavaJoinPoints.varRef(rhsVarName, fieldDecl.type);
        const newRhs = rhsArrayAccess.copy() as ArrayAccess;
        newRhs.setFirstChild(newRhsVar);

        const binOp = ClavaJoinPoints.binaryOp("=", newLhs, newRhs);
        const stmt = ClavaJoinPoints.exprStmt(binOp);

        return [stmt];
    }
}

/**
 * foo = *bar
 */
export class PointerToScalarAssignment extends StructRefDecomposer {
    public validate(leftRef: Varref, rightRef: Varref): boolean {
        const lhsIsPointer = leftRef.type.isPointer;
        const rhsIsPointer = rightRef.type.isPointer;
        const rhsIsDeref = rightRef.parent instanceof UnaryOp && rightRef.parent.kind === "deref";

        return !lhsIsPointer && rhsIsPointer && rhsIsDeref;
    }

    protected decomposeField(leftRef: Varref, rightRef: Varref, fieldDecl: Vardecl, lhsVarName: string, rhsVarName: string): Statement[] {
        const newLhs = ClavaJoinPoints.varRef(lhsVarName, fieldDecl.type);
        const pointerType = ClavaJoinPoints.pointer(fieldDecl.type);
        const newRhs = ClavaJoinPoints.varRef(rhsVarName, pointerType);
        const deref = ClavaJoinPoints.unaryOp("*", newRhs);
        const assign = ClavaJoinPoints.binaryOp("=", newLhs, deref);
        const stmt = ClavaJoinPoints.exprStmt(assign);

        return [stmt];
    }
}

export class PointerToPointerAssignment extends StructRefDecomposer {
    public validate(leftRef: Varref, rightRef: Varref): boolean {
        const lhsIsPointer = leftRef.type.isPointer;
        const rhsIsPointer = rightRef.type.isPointer;

        return lhsIsPointer && rhsIsPointer;
    }
    protected decomposeField(leftRef: Varref, rightRef: Varref, fieldDecl: Vardecl, lhsVarName: string, rhsVarName: string): Statement[] {
        const pointerType = ClavaJoinPoints.pointer(fieldDecl.type);
        const newRhs = ClavaJoinPoints.varRef(rhsVarName, pointerType);
        const newLhs = ClavaJoinPoints.varRef(lhsVarName, pointerType);
        const assign = ClavaJoinPoints.binaryOp("=", newLhs, newRhs);
        const stmt = ClavaJoinPoints.exprStmt(assign);

        return [stmt];
    }
}

/**
 * foo = &bar, where foo is a pointer and bar is not
 */
export class DerefToScalarAssignment extends StructRefDecomposer {
    public validate(leftRef: Varref, rightRef: Varref): boolean {
        const lhsIsPointer = leftRef.type.isPointer;
        const rhsIsPointer = rightRef.type.isPointer;
        const rhsIsAddrOf = rightRef.parent instanceof UnaryOp && rightRef.parent.kind === "addr_of";

        return lhsIsPointer && !rhsIsPointer && rhsIsAddrOf;
    }

    protected decomposeField(leftRef: Varref, rightRef: Varref, fieldDecl: Vardecl, lhsVarName: string, rhsVarName: string): Statement[] {
        const pointerType = ClavaJoinPoints.pointer(fieldDecl.type);
        const newRhs = ClavaJoinPoints.varRef(rhsVarName, fieldDecl.type);
        const addrOf = ClavaJoinPoints.unaryOp("&", newRhs);
        const newLhs = ClavaJoinPoints.varRef(lhsVarName, pointerType);
        const assign = ClavaJoinPoints.binaryOp("=", newLhs, addrOf);
        const stmt = ClavaJoinPoints.exprStmt(assign);

        return [stmt];
    }
}

/**
 * foo[i] = bar, where foo is an array of structs and bar is a struct
 * This only works if the array is 1D
 */
export class StructToArrayPositionAssignment extends StructRefDecomposer {
    public validate(leftRef: Varref, rightRef: Varref): boolean {
        const lhsIsPointer = leftRef.type.isPointer;
        const rhsIsPointer = rightRef.type.isPointer;
        const lhsIsArray = leftRef.type.isArray;
        const rhsIsArray = rightRef.type.isArray;

        console.log("lhs: ", leftRef.code);
        console.log("rhs: ", rightRef.code);
        console.log("lhsIsPointer", lhsIsPointer);
        console.log("rhsIsPointer", rhsIsPointer);
        console.log("lhsIsArray", lhsIsArray);
        console.log("rhsIsArray", rhsIsArray);

        return !lhsIsPointer && !rhsIsPointer && lhsIsArray && !rhsIsArray;
    }

    protected decomposeField(leftRef: Varref, rightRef: Varref, fieldDecl: Vardecl, lhsVarName: string, rhsVarName: string): Statement[] {
        const statements: Statement[] = [];

        if (fieldDecl.type.isArray) {
            const lhsArrayAccess = leftRef.parent as ArrayAccess;
            const arrayIndexExpr = lhsArrayAccess.children[1] as Expression;

            const dest = fieldDecl.varref();

            const addrVarref = ClavaJoinPoints.varRef(lhsVarName, fieldDecl.type);
            const addrCalc = ClavaJoinPoints.binaryOp("+", addrVarref as Varref, arrayIndexExpr.copy() as Expression);
            const origin = ClavaJoinPoints.parenthesis(addrCalc);

            const sizeof = ClavaJoinPoints.integerLiteral(fieldDecl.type.arraySize);

            const stmt = StructDecomposerUtil.generateMemcpy(dest, origin, sizeof);
            statements.push(stmt);
        }
        else {
            const lhsArrayAccess = leftRef.parent as ArrayAccess;
            const arrayIndexExpr = lhsArrayAccess.children[1] as Expression;

            const newLhsVarref = fieldDecl.varref();
            const newArrayAccess = ClavaJoinPoints.arrayAccess(newLhsVarref, arrayIndexExpr);

            const newRhsVarref = ClavaJoinPoints.varRef(rhsVarName, fieldDecl.type);
            const assign = ClavaJoinPoints.binaryOp("=", newArrayAccess, newRhsVarref);
            const stmt = ClavaJoinPoints.exprStmt(assign);
            statements.push(stmt);
        }

        return statements;
    }

}