import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js"
import { ArrayAccess, ArrayType, BinaryOp, Call, DeclStmt, Expression, Field, FunctionJp, MemberAccess, Param, Statement, UnaryOp, Vardecl, VariableArrayType, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import { ArrayOfStructsDecl, DirectListDecl, MallocDecl, PointerListDecl, StructDeclFlattener, StructToStructDecl } from "./StructDeclFlattener.js";
import { ArrayToArrayAssignment, DerefToScalarAssignment, PointerToPointerAssignment, PointerToScalarAssignment, ScalarToScalarAssignment, StructToArrayPositionAssignment } from "./StructRefFlattener.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { StructFlatteningAlgorithm } from "../StructFlatteningAlgorithm.js";

export class LegacyStructFlattener extends StructFlatteningAlgorithm {
    constructor(silent: boolean = false) {
        super("LegacyStructFlattener", silent);
    }

    public decompose(fields: Field[], name: string, startingPoint?: FunctionJp): void {
        this.log(`Decomposing struct "${name}" with ${fields.length} field(s)`);

        const decls = this.getAllDeclsOfStruct(name);
        this.log(`Found ${decls.length} declarations for struct "${name}"`);

        for (const decl of decls) {
            this.decomposeDeclAndRefs(decl, fields);
        }
        this.logLine();

        const params = this.getAllParamsOfStruct(name);
        this.log(`Found ${params.length} params for struct "${name}"`);

        for (const param of params) {
            this.decomposeParam(param, fields);
        }
    }

    // -----------------------------------------------------------------------
    private getAllDeclsOfStruct(name: string): Vardecl[] {
        const decls = [];

        for (const decl of Query.search(Vardecl)) {
            const type = decl.type;
            const typeName = this.simpleType(type);

            if (typeName.startsWith(name) && !decl.isParam) {
                decls.push(decl);
            }
        }
        return decls;
    }

    private decomposeDeclAndRefs(decl: Vardecl, fields: Field[]): [string, Vardecl][] {
        // First, decompose the decl
        const fieldDecls = this.decomposeDecl(decl, fields);

        // Then, find all references to the decl and replace them
        // local decl: the parent scope
        // global decl: the entire program (though there may be naming conflicts)
        const startJp = decl.isGlobal ? decl.root : decl.getAncestor("scope")!;
        const refs: Varref[] = [];

        for (const varref of Query.searchFrom(startJp, Varref)) {
            if (varref.name === decl.name) {
                refs.push(varref);
            }
        }
        for (const varref of refs) {
            this.replaceRef(varref, fieldDecls);
        }

        decl.getAncestor("declStmt").detach();
        return fieldDecls;
    }

    private decomposeDecl(decl: Vardecl, fields: Field[]): [string, Vardecl][] {
        const newVars: [string, Vardecl][] =
            this.isInitialized(decl) ?
                this.createNewVarsWithInit(decl, fields) :
                this.createNewVarsNoInit(decl, fields);

        for (const [_, newVar] of newVars.reverse()) {
            const parentStmt = decl.getAncestor("declStmt") as DeclStmt;
            const wrappedDecl = ClavaJoinPoints.declStmt(newVar);
            parentStmt.insertAfter(wrappedDecl);
        }

        return newVars;
    }

    private isInitialized(decl: Vardecl) {
        if (!decl.hasInit) {
            return false;
        }
        if (decl.children.length == 1) {
            const child = decl.children[0];
            if (child instanceof Varref) {
                return true;
            }
            if ((child instanceof Expression) && child.children.length == 0) {
                return false;
            }
        }
        return true;
    }

    private createNewVarsNoInit(decl: Vardecl, fields: Field[]): [string, Vardecl][] {
        const newVars: [string, Vardecl][] = [];
        const declName = decl.name;

        for (const field of fields) {
            const fieldName = field.name;
            const newVarName = `${declName}_${fieldName}`;

            let fieldType = field.type;
            if (decl.type.kind == "PointerType") {
                fieldType = ClavaJoinPoints.pointer(fieldType);
            }

            // This only works for one-dimensional arrays
            if (decl.type.isArray && !(decl.type instanceof VariableArrayType)) {
                const arrayType = decl.type as ArrayType;
                const arraySize = ClavaJoinPoints.exprLiteral(String(arrayType.arraySize));
                const newType = ClavaJoinPoints.variableArrayType(field.type, arraySize);

                const newVar = ClavaJoinPoints.varDeclNoInit(newVarName, newType);
                newVars.push([fieldName, newVar]);

            }
            else if (decl.type.isArray && decl.type instanceof VariableArrayType) {
                this.logWarning("Variable array type not supported: " + decl.code);
            }
            else {
                const newVar = ClavaJoinPoints.varDeclNoInit(newVarName, fieldType);
                newVars.push([fieldName, newVar]);
            }
        }

        return newVars;
    }

    private createNewVarsWithInit(decl: Vardecl, fields: Field[]): [string, Vardecl][] {
        let initVars: [string, Vardecl][] = [];

        const decomposers: StructDeclFlattener[] = [
            new DirectListDecl(),
            new PointerListDecl(),
            new MallocDecl(),
            new StructToStructDecl(),
            new ArrayOfStructsDecl()
        ];
        for (const decomposer of decomposers) {
            if (decomposer.validate(decl)) {
                return decomposer.decompose(decl, fields);
            }
        }

        this.logWarning("Could not decompose init: " + decl.code);
        return initVars;
    }

    private replaceRef(ref: Varref, fieldDecls: [string, Vardecl][]): void {
        // If it's part of a decl struct-to-struct assignment, decompose it later
        if (ref.getAncestor("vardecl") != null) {
            const decl = ref.getAncestor("vardecl") as Vardecl;
            const declType = this.simpleType(decl.type);
            const refType = this.simpleType(ref.type);

            if (declType === refType) {
                return;
            }
        }
        // If the varref is a member access, replace it with a ref to the field decl
        if (ref.parent instanceof MemberAccess) {
            this.replaceRefByField(ref, fieldDecls);
        }
        // Varref is a member access in an array of structs, e.g., foo[0].bar
        else if (ref.parent instanceof ArrayAccess && ref.parent.getAncestor("memberAccess") != null) {
            this.replaceArrayRefByField(ref, fieldDecls);
        }
        // Struct-to-struct assignment, e.g., foo = bar
        else if (ref.getAncestor("binaryOp") != null) {
            const binaryOp = ref.getAncestor("binaryOp") as BinaryOp;

            if (binaryOp.kind === "assign") {
                const leftRef = Query.searchFromInclusive(binaryOp.left, Varref).first() as Varref;
                const rightRef = Query.searchFromInclusive(binaryOp.right, Varref).first() as Varref;

                const isLeft = leftRef.name === ref.name;
                this.replaceStructToStructAssignment(leftRef, rightRef, fieldDecls, isLeft);

                binaryOp.parent.detach();
                return;

            }
        }
        // Struct-to-struct assignment using operator=
        const parentCall = ref.getAncestor("call") == null ? null : ref.getAncestor("call") as Call;
        if (parentCall != null && parentCall.name.includes("operator=")) {
            const leftRef = Query.searchFromInclusive(parentCall.args[0], Varref).first() as Varref;
            const rightRef = Query.searchFromInclusive(parentCall.args[1], Varref).first() as Varref;
            const isLeft = leftRef.name === ref.name;

            this.replaceStructToStructAssignment(leftRef, rightRef, fieldDecls, isLeft);

            parentCall.parent.detach();
            return;
        }

        // Struct passed as argument to a function, e.g., doSomething(bar)
        else if (ref.isFunctionArgument) {
            this.replaceRefArg(ref, fieldDecls);
        }
        // Unknown case
        else {
            //this.logWarning(`Could not replace ref: ${ref.code}`);
        }
    }

    private replaceRefByField(ref: Varref, fieldDecls: [string, Vardecl][]): void {
        const fieldAccess = ref.parent as MemberAccess;
        const fieldName = fieldAccess.name;

        const nameAndVardecl = fieldDecls.find(([name, _]) => name === fieldName)!;
        const newVar = nameAndVardecl[1];
        const newRef = ClavaJoinPoints.varRef(newVar);

        // foo.bar
        if (!fieldAccess.arrow) {
            fieldAccess.replaceWith(newRef);
        }
        else {
            const derefRef = ClavaJoinPoints.unaryOp("*", newRef);

            // a + foo->bar
            if (fieldAccess.parent instanceof BinaryOp && fieldAccess.parent.rightJp == fieldAccess) {
                const parenthesis = ClavaJoinPoints.parenthesis(derefRef);
                fieldAccess.replaceWith(parenthesis);
            }
            // foo->bar
            else {
                fieldAccess.replaceWith(derefRef);
            }
        }
    }

    private replaceStructToStructAssignment(leftRef: Varref, rightRef: Varref, fieldDecls: [string, Vardecl][], isLeft: boolean): void {
        const newExprs: Statement[] = [];

        const decomposers = [
            new ScalarToScalarAssignment(),
            new ArrayToArrayAssignment(),
            new PointerToScalarAssignment(),
            new PointerToPointerAssignment(),
            new DerefToScalarAssignment(),
            new StructToArrayPositionAssignment()
        ];

        for (const decomposer of decomposers) {
            if (decomposer.validate(leftRef, rightRef)) {
                const fieldExprs = decomposer.decompose(leftRef, rightRef, fieldDecls, isLeft);
                newExprs.push(...fieldExprs);
                break;
            }
        }

        if (newExprs.length == 0) {
            this.logWarning(`Could not decompose struct assignment with l-value ${leftRef.code} and r-value ${rightRef.code}`);
            return;
        }

        for (const expr of newExprs) {
            leftRef.parent.insertAfter(expr);
        }
    }

    private replaceArrayRefByField(ref: Varref, fieldDecls: [string, Vardecl][]): void {
        const arrayAccess = ref.parent as ArrayAccess;
        const arrayIndex = arrayAccess.children[1].copy() as Expression;
        const memberAccess = ref.parent.getAncestor("memberAccess") as MemberAccess;

        const fieldName = memberAccess.name;
        const fieldArray = fieldDecls.find(([name, _]) => name === fieldName)![1];

        const newVar = fieldArray.varref();
        const arrAccess = ClavaJoinPoints.arrayAccess(newVar, arrayIndex);

        memberAccess.replaceWith(arrAccess);
    }

    private replaceRefArg(ref: Varref, fieldDecls: [string, Vardecl][]): void {
        const call = ref.getAncestor("call") as Call;
        let refIndex = -1;
        const newArgs: Expression[] = [];

        for (let i = 0; i < call.args.length; i++) {
            const arg = call.args[i] as Expression;

            // doSomething(Data bar) -> Data bar; doSomething(bar)
            // doSomething(Data *bar) -> Data *bar; doSomething(bar)
            if (arg instanceof Varref && arg.name === ref.name) {
                for (const [_, newVar] of fieldDecls) {
                    const newArg = ClavaJoinPoints.varRef(newVar);
                    newArgs.push(newArg);
                }
                refIndex = i;
            }
            // doSomething(Data bar) -> Data *bar; doSomething(*bar)
            else if (arg instanceof UnaryOp && arg.kind === "deref" && arg.children[0] instanceof Varref) {
                for (const [_, newVar] of fieldDecls) {
                    const newRef = ClavaJoinPoints.varRef(newVar);
                    const newArg = ClavaJoinPoints.unaryOp("*", newRef);
                    newArgs.push(newArg);
                }
                refIndex = i;
            }
            // doSomething(Data *bar) -> Data bar; doSomething(&bar)
            else if (arg instanceof UnaryOp && arg.kind === "addr_of" && arg.children[0] instanceof Varref) {
                for (const [_, newVar] of fieldDecls) {
                    const newRef = ClavaJoinPoints.varRef(newVar);
                    const newArg = ClavaJoinPoints.unaryOp("&", newRef);
                    newArgs.push(newArg);
                }
                refIndex = i;
            }
        }
        const prologue = call.args.slice(0, refIndex) as Expression[];
        const reversedArgs = newArgs.reverse();
        const epilogue = call.args.slice(refIndex + 1) as Expression[];
        const fullArgs = [...prologue, ...reversedArgs, ...epilogue];

        const newCall = ClavaJoinPoints.call(call.function, ...fullArgs);
        call.replaceWith(newCall);
    }

    private getAllParamsOfStruct(name: string): Param[] {
        const params = [];

        for (const decl of Query.search(Param)) {
            const type = decl.type;
            const typeName = this.simpleType(type);
            const parentFun = decl.getAncestor("function") as FunctionJp;
            const hasParentFunction = parentFun != undefined && parentFun.isImplementation;

            if (typeName === name && decl.isParam && hasParentFunction) {
                params.push(decl);
            }
        }
        return params;
    }

    private decomposeParam(param: Param, fields: Field[]): void {
        const fun = param.getAncestor("function") as FunctionJp;
        const scope = fun.body;

        const fieldParams = this.replaceParamByFields(param, fields);

        for (const varref of Query.searchFrom(scope, Varref)) {
            if (varref.name === param.name) {
                this.replaceRef(varref, fieldParams);
            }
        }
    }

    private replaceParamByFields(param: Param, fields: Field[]): [string, Param][] {
        const newVars = this.createNewVarsNoInit(param, fields);
        const newParams: [string, Param][] = [];

        for (const [fieldName, newVar] of newVars) {
            const newParam = ClavaJoinPoints.param(newVar.name, newVar.type);
            newParams.push([fieldName, newParam]);
        }

        const fun = param.parent as FunctionJp;
        const newFunParams: Param[] = [];

        for (const funParam of fun.params) {
            if (funParam.name === param.name) {
                newParams.forEach(([_, newParam]) => newFunParams.push(newParam));
            }
            else {
                newFunParams.push(funParam);
            }
        }
        fun.setParams(newFunParams);
        this.updateFunctionDeclarations(fun);

        return newParams;
    }

    private updateFunctionDeclarations(fun: FunctionJp): void {
        for (const f of Query.search(FunctionJp, { name: fun.name })) {
            if (!f.isImplementation) {
                const funDeclStr = `${fun.getDeclaration(true)};`;
                const newFunDecl = ClavaJoinPoints.stmtLiteral(funDeclStr);
                f.replaceWith(newFunDecl);
            }
        }
    }
}

export class StructDecomposerUtil {
    public static generateMemcpy(dest: Expression, source: Expression, size: Expression): Statement {
        const retType = ClavaJoinPoints.type("void*");
        const call = ClavaJoinPoints.callFromName("memcpy", retType, dest, source, size);

        if (Clava.isCxx()) {
            call.setName("std::memcpy");
            for (const file of Clava.getProgram().files) {
                file.addInclude("cstring", true);
            }
        }
        return ClavaJoinPoints.exprStmt(call);
    }
}