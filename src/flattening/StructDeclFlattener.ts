import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { ArrayType, BinaryOp, Call, Cast, Expression, ExprStmt, Field, ImplicitValue, InitList, IntLiteral, Literal, Struct, UnaryExprOrType, UnaryOp, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { StructDecomposerUtil } from "./StructFlattener.js";

export interface StructDeclFlattener {
    validate(decl: Vardecl): boolean;
    decompose(decl: Vardecl, fields: Field[]): [string, Vardecl][];
}

/**
 * Decomposes struct initializations that are done by direct list assignment,
 * of AST structure like:
 * >vardecl
 * ->initList
 * -->intLiteral
 * -->floatLiteral
 * -->literal
 * Examples:
 * Data dataInit1 = {102, 98.9, "Sample Data 1"}
 * Data dataInit2 = {.id = 103, .value = 97.9, .name = "Sample Data 2"}
 * Data dataInit3 = {.value = 96.9, .id = 104, .name = "Sample Data 3"}
 * Data dataInit4 = {5}
 * Data dataInit5 = {.id = 105}
 */
export class DirectListDecl implements StructDeclFlattener {
    validate(decl: Vardecl): boolean {
        const cond1 = decl.children.length != 1;
        const cond2 = decl.type.isArray;
        if (cond1 || cond2) {
            return false;
        }
        return decl.children[0] instanceof InitList;
    }

    decompose(decl: Vardecl, fields: Field[]): [string, Vardecl][] {
        const newVars: [string, Vardecl][] = [];

        const initList = decl.children[0] as InitList;

        for (let i = 0; i < fields.length; i++) {
            const field = fields[i];
            const fieldName = field.name;
            const fieldInit = initList.children[i];
            const newVarName = `${decl.name}_${fieldName}`;

            if (fieldInit instanceof ImplicitValue) {
                const newVar = ClavaJoinPoints.varDeclNoInit(newVarName, field.type);
                newVars.push([fieldName, newVar]);
            }
            else if (fieldInit instanceof Literal) {
                const newVar = ClavaJoinPoints.varDecl(newVarName, fieldInit.copy());
                newVars.push([fieldName, newVar]);
            }
            else {
                console.log(`[DirectListAssignment] Unknown init ${fieldInit}`);
                const newVar = ClavaJoinPoints.varDeclNoInit(newVarName, field.type);
                newVars.push([fieldName, newVar]);
            }
        }

        return newVars;
    }
}

/**
 * Decomposes struct initializations that are done by assigning a list to a pointer,
 * of AST structure like:
 * >vardecl
 * ->unaryOp  {kind: addr_of}
 * -->literal
 * --->initList
 * ---->intLiteral
 * ---->implicitValue
 * ---->implicitValue
 * Examples:
 * Data *dataInit6 = &(Data){106, 95.9, "Sample Data 6"}
 * Data *dataInit7 = &(Data){.id = 107, .value = 94.9, .name = "Sample Data 7"}
 * Data *dataInit8 = &(Data){.value = 93.9, .id = 108, .name = "Sample Data 8"}
 * Data *dataInit9 = &(Data){109}
 * Data *dataInit10 = &(Data){.id = 110}
 */
export class PointerListDecl implements StructDeclFlattener {
    validate(decl: Vardecl): boolean {
        try {
            const cond1 = decl.children.length === 1;
            const cond2 = decl.children[0] instanceof UnaryOp && decl.children[0].kind === "addr_of";
            const cond3 = decl.children[0].children[0] instanceof Literal;
            const cond4 = decl.children[0].children[0].children[0] instanceof InitList;
            if (!(cond1 && cond2 && cond3 && cond4)) {
                return false;
            }
        } catch (e) {
            return false;
        }
        return true;
    }

    decompose(decl: Vardecl, fields: Field[]): [string, Vardecl][] {
        const newVars: [string, Vardecl][] = [];

        const initList = decl.children[0].children[0].children[0] as InitList;

        for (let i = 0; i < fields.length; i++) {
            const field = fields[i];
            const fieldName = field.name;
            const fieldInit = initList.children[i];
            const newVarName = `${decl.name}_${fieldName}`;
            const pointerType = ClavaJoinPoints.pointer(field.type);

            if (fieldInit instanceof ImplicitValue) {
                const newVar = ClavaJoinPoints.varDeclNoInit(newVarName, pointerType);
                newVars.push([fieldName, newVar]);
            }
            else if (fieldInit instanceof Literal) {
                const initValName = `${newVarName}_init`;
                const initVal = ClavaJoinPoints.varDecl(initValName, fieldInit.copy());
                const addrOfInitVal = ClavaJoinPoints.unaryOp("&", initVal.varref());
                decl.insertBefore(initVal);

                const newVar = ClavaJoinPoints.varDecl(newVarName, addrOfInitVal);
                newVars.push([fieldName, newVar]);
            }
            else {
                console.log(`[DirectListAssignment] Unknown init ${fieldInit}`);
                const newVar = ClavaJoinPoints.varDeclNoInit(newVarName, field.type);
                newVars.push([fieldName, newVar]);
            }
        }

        return newVars;
    }
}

/**
 * Decomposes struct initializations that are done by assigning a list to a pointer,
 * of AST structure like:
 * >vardecl
 * ->cast
 * -->call  {fun: malloc}
 * --->varref  {name: malloc}  {type: functionType}
 * --->unaryExprOrType
 * or
 * >vardecl
 * ->call  {fun: malloc}
 * -->varref  {name: malloc}  {type: functionType}
 * -->unaryExprOrType
 * Examples:
 * Data *dataInit12 = malloc(sizeof(Data))
 * Data *dataInit13 = (Data *) malloc(sizeof(Data))
 * Data *dataInit15 = (Data *) calloc(1, sizeof(Data))
 * 
 */
export class MallocDecl implements StructDeclFlattener {
    validate(decl: Vardecl): boolean {
        const cond1 = decl.children.length === 1;
        if (!cond1) {
            return false;
        }
        const possibleCall = decl.children[0] instanceof Cast ? decl.children[0].children[0] : decl.children[0];

        if (possibleCall instanceof Call) {
            const cond2 = [/*"calloc",*/ "malloc"].includes(possibleCall.name);
            if (!cond2) {
                if (possibleCall.name == "calloc") {
                    console.log(`[MallocAssignment] calloc is not supported yet`);
                }
                return false;
            }

            const lastArg = possibleCall.args[possibleCall.args.length - 1];
            if (lastArg instanceof UnaryExprOrType) {

                const isSizeof = lastArg.kind === "sizeof";
                if (!isSizeof) {
                    return false;
                }
                const simpleDeclType = decl.type.code.replace("*", "").replace("struct ", "").trim();
                const simpleLastArgType = lastArg.argType.code.replace("*", "").replace("struct ", "").trim();

                if (simpleDeclType !== simpleLastArgType) {
                    console.log(`[MallocAssignment] Different types in malloc/calloc: ${decl.type.code} and ${lastArg.argType.code}`);
                    return false;
                }
                return true;
            }
            else if (lastArg instanceof IntLiteral) {
                const val = lastArg.value;
                const structName = decl.type.code.replace("*", "").replace("struct ", "").trim();
                console.log(`[MallocAssignment] malloc/calloc size with constant size ${val}, assuming this is enough for struct type ${structName}`);
                return true;
            }
            else if (lastArg instanceof BinaryOp) {
                const lhs = lastArg.left;
                const rhs = lastArg.right;

                const sizeof = (lhs instanceof UnaryExprOrType && lhs.kind === "sizeof") ?
                    lhs : (rhs instanceof UnaryExprOrType && rhs.kind === "sizeof") ? rhs : undefined;
                const factor = (lhs instanceof IntLiteral) ? lhs : (rhs instanceof IntLiteral) ? rhs : undefined;

                if (sizeof === undefined || factor === undefined || factor.astId == sizeof.astId) {
                    console.log(`[MallocAssignment] Unknown malloc/calloc size given by binary op`);
                    return false;
                }

                const simpleDeclType = decl.type.code.replace("*", "").replace("struct ", "").trim();
                const simpleLastArgType = sizeof.argType.code.replace("*", "").replace("struct ", "").trim();

                if (simpleDeclType !== simpleLastArgType) {
                    console.log(`[MallocAssignment] Different types in malloc/calloc: ${decl.type.code} and ${sizeof.argType.code}`);
                    return false;
                }
                return true;
            }
            else {
                console.log(`[MallocAssignment] Unknown malloc/calloc size given by JP type ${lastArg.joinPointType}`);
                return false;
            }
        }
        else {
            return false;
        }
    }

    decompose(decl: Vardecl, fields: Field[]): [string, Vardecl][] {
        const newVars: [string, Vardecl][] = [];

        for (let i = 0; i < fields.length; i++) {
            const type = fields[i].type;
            const pointerType = ClavaJoinPoints.pointer(type);
            const fieldName = fields[i].name;
            const newVarName = `${decl.name}_${fieldName}`;

            const lastArg = Query.searchFrom(decl, Call).first()!.args[0];
            let sizeofArg: Expression;

            if (lastArg instanceof BinaryOp) {
                const lhs = lastArg.left;
                const rhs = lastArg.right;

                const factor = (lhs instanceof IntLiteral) ? lhs : (rhs instanceof IntLiteral) ? rhs : undefined;

                sizeofArg = ClavaJoinPoints.binaryOp("*", ClavaJoinPoints.exprLiteral(`sizeof(${type.code})`), factor!);
            }
            else {
                sizeofArg = ClavaJoinPoints.exprLiteral(`sizeof(${type.code})`);
            }

            const call = ClavaJoinPoints.callFromName("malloc", ClavaJoinPoints.type("void*"), sizeofArg);
            const cast = ClavaJoinPoints.cStyleCast(pointerType, call);

            const newVar = ClavaJoinPoints.varDecl(newVarName, cast);
            newVars.push([fieldName, newVar]);
        }

        return newVars;
    }
}

export class StructToStructDecl implements StructDeclFlattener {
    validate(decl: Vardecl): boolean {
        if (decl.children.length !== 1) {
            return false;
        }
        const varref = Query.searchFrom(decl, Varref).first();
        if (varref == undefined) {
            return false;
        }
        const declBaseType = decl.type.code.replace("*", "").replace("struct ", "").trim();
        const varrefBaseType = varref.type.code.replace("*", "").replace("struct ", "").trim();

        return declBaseType === varrefBaseType;
    }

    decompose(decl: Vardecl, fields: Field[]): [string, Vardecl][] {
        const newVars: [string, Vardecl][] = [];

        const declName = decl.name;
        const rhsVarref = Query.searchFrom(decl, Varref).first()!;

        const rhsIsDeref = rhsVarref.parent instanceof UnaryOp && rhsVarref.parent.kind === "deref";
        const rhsIsAddrOf = rhsVarref.parent instanceof UnaryOp && rhsVarref.parent.kind === "addr_of";
        const rhsIsPointer = rhsVarref.type.isPointer;
        const lhsIsPointer = decl.type.isPointer;

        for (const field of fields) {
            const fieldName = field.name;
            const lhsVarName = `${declName}_${fieldName}`;
            const rhsVarName = `${rhsVarref.name}_${fieldName}`;

            if (!lhsIsPointer && !rhsIsPointer) {
                if (field.type.isPointer) {
                    const dest = ClavaJoinPoints.unaryOp("&", ClavaJoinPoints.varRef(lhsVarName, field.type));
                    const src = ClavaJoinPoints.unaryOp("&", ClavaJoinPoints.varRef(rhsVarName, field.type));

                    const sizeof1 = ClavaJoinPoints.exprLiteral(`sizeof(${rhsVarName})`);
                    const sizeof2 = ClavaJoinPoints.exprLiteral(`sizeof(${rhsVarName}[0])`);
                    const size = ClavaJoinPoints.binaryOp("/", sizeof1, sizeof2);

                    const memcpy = StructDecomposerUtil.generateMemcpy(dest, src, size);

                    const newLhs = ClavaJoinPoints.varDeclNoInit(lhsVarName, field.type);
                    decl.insertAfter(memcpy);

                    newVars.push([fieldName, newLhs]);
                }
                else {
                    const dummyRhs = ClavaJoinPoints.varRef(rhsVarName, field.type);
                    const newLhs = ClavaJoinPoints.varDecl(lhsVarName, dummyRhs);

                    newVars.push([fieldName, newLhs]);
                }
            }
            else if (!lhsIsPointer && rhsIsPointer && rhsIsDeref) {
                const pointerType = ClavaJoinPoints.pointer(field.type);
                const dummyRhs = ClavaJoinPoints.varRef(rhsVarName, pointerType);
                const derefRhs = ClavaJoinPoints.unaryOp("*", dummyRhs);
                const newLhs = ClavaJoinPoints.varDecl(lhsVarName, derefRhs);

                newVars.push([fieldName, newLhs]);
            }
            else if (lhsIsPointer && rhsIsPointer) {
                const pointerType = ClavaJoinPoints.pointer(field.type);
                const dummyRhs = ClavaJoinPoints.varRef(rhsVarName, pointerType);
                const newLhs = ClavaJoinPoints.varDecl(lhsVarName, dummyRhs);

                newVars.push([fieldName, newLhs]);
            }
            else if (lhsIsPointer && !rhsIsPointer && rhsIsAddrOf) {
                const dummyRhs = ClavaJoinPoints.varRef(rhsVarName, field.type);
                const addrOfRhs = ClavaJoinPoints.unaryOp("&", dummyRhs);
                const newLhs = ClavaJoinPoints.varDecl(lhsVarName, addrOfRhs);

                newVars.push([fieldName, newLhs]);
            }
        }

        return newVars;
    }
}

export class ArrayOfStructsDecl implements StructDeclFlattener {
    validate(decl: Vardecl): boolean {
        const isArray = decl.type.isArray;
        if (!isArray) {
            return false;
        }
        if (decl.children.length !== 1) {
            return false;
        }
        if (!(decl.children[0] instanceof InitList)) {
            return false;
        }
        return true;
    }

    decompose(decl: Vardecl, fields: Field[]): [string, Vardecl][] {
        const newVars: [string, Vardecl][] = [];

        for (const field of fields) {
            const fieldName = field.name;
            const newVarName = `${decl.name}_${fieldName}`;

            const arrayType = decl.type as ArrayType;
            const arraySize = ClavaJoinPoints.exprLiteral(String(arrayType.arraySize));
            const newType = ClavaJoinPoints.variableArrayType(field.type, arraySize);

            const newVar = ClavaJoinPoints.varDeclNoInit(newVarName, newType);
            newVars.push([fieldName, newVar]);
        }

        const arrayAccesses: ExprStmt[] = [];
        const initMasterList = decl.children[0] as InitList;

        for (let i = 0; i < initMasterList.children.length; i++) {
            const initList = initMasterList.children[i] as InitList;
            const idx = ClavaJoinPoints.integerLiteral(i) as IntLiteral;

            for (let j = 0; j < fields.length; j++) {
                const arrayDecl = newVars[j][1];
                // alternative: actually create an ArrayAccess using the ref and idx
                const arrayAccess = ClavaJoinPoints.exprLiteral(`${arrayDecl.name}[${idx.value}]`);
                const fieldInit = initList.children[j];

                if (!(fieldInit instanceof ImplicitValue)) {
                    const binaryOp = ClavaJoinPoints.binaryOp("assign", arrayAccess, ClavaJoinPoints.exprLiteral(fieldInit.code));
                    const expr = ClavaJoinPoints.exprStmt(binaryOp);
                    arrayAccesses.push(expr);
                }
            }
        }
        for (const expr of arrayAccesses.reverse()) {
            decl.insertAfter(expr);
        }
        return newVars;
    }
}