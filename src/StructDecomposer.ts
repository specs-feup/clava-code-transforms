import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js"
import { BinaryOp, Call, DeclStmt, Expression, ExprStmt, FunctionJp, Joinpoint, MemberAccess, Param, Struct, TypedefDecl, UnaryOp, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import { DirectListAssignment, MallocAssignment, PointerListAssignment, StructAssignmentDecomposer, StructToStructAssignment } from "./StructAssignmentDecomp.js";
import { AdvancedTransform } from "./AdvancedTransform.js";

export class StructDecomposer extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("StructDecomposer", silent);
    }

    public decomposeAll(): string[] {
        const structs: { [key: string]: Struct } = {};

        for (const struct of Query.search(Struct)) {
            const name = this.getStructName(struct);
            structs[name] = struct;
        }
        this.log(`Found ${Object.keys(structs).length} eligible structs`);

        const decompNames = [];
        for (const structName in structs) {
            const struct = structs[structName];
            this.decompose(struct, structName);
            this.logLine();
            decompNames.push(structName);
        }
        return decompNames;
    }

    public decomposeByName(name: string | string[]): void {
        for (const struct of Query.search(Struct)) {
            const structName = this.getStructName(struct);

            if (structName === name) {
                this.decompose(struct, name);
            }
        }
    }

    public decomposeByType(struct: Struct): void {
        const name = this.getStructName(struct);
        this.decompose(struct, name);
    }

    private decompose(struct: Struct, name: string): void {
        this.log(`Decomposing struct "${name}"`);

        const decls = this.getAllDeclsOfStruct(name);
        this.log(`Found ${decls.length} declarations for struct "${name}"`);

        for (const decl of decls) {
            this.decomposeDeclAndRefs(decl, struct);
        }

        const params = this.getAllParamsOfStruct(name);
        this.log(`Found ${params.length} params for struct "${name}"`);

        for (const param of params) {
            this.decomposeParam(param, struct);
        }
    }

    public getStructName(struct: Struct): string {
        let name: string = struct.name;

        // typedef struct { ... } typedef_name;
        if (struct.name === "") {
            const jp: Joinpoint = struct.children[struct.children.length - 1].children[0];
            const typedef = jp as TypedefDecl;
            name = typedef.name;
        }
        return name;
    }

    private getAllDeclsOfStruct(name: string): Vardecl[] {
        const decls = [];

        for (const decl of Query.search(Vardecl)) {
            const type = decl.type;
            const typeName = type.code.replace("*", "").replace("struct ", "").trim();

            if (typeName === name && !decl.isParam) {
                decls.push(decl);
            }
        }
        return decls;
    }

    private decomposeDeclAndRefs(decl: Vardecl, struct: Struct): [string, Vardecl][] {
        // First, decompose the decl
        const fieldDecls = this.decomposeDecl(decl, struct);

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

    private decomposeDecl(decl: Vardecl, struct: Struct): [string, Vardecl][] {
        const newVars: [string, Vardecl][] = decl.hasInit ?
            this.createNewVarsWithInit(decl, struct) :
            this.createNewVarsNoInit(decl, struct);

        for (const [_, newVar] of newVars.reverse()) {
            const parentStmt = decl.getAncestor("declStmt") as DeclStmt;
            const wrappedDecl = ClavaJoinPoints.declStmt(newVar);
            parentStmt.insertAfter(wrappedDecl);
        }

        return newVars;
    }

    private createNewVarsNoInit(decl: Vardecl, struct: Struct): [string, Vardecl][] {
        const newVars: [string, Vardecl][] = [];
        const declName = decl.name;

        for (const field of struct.fields) {
            const fieldName = field.name;
            const newVarName = `${declName}_${fieldName}`;

            let fieldType = field.type;
            if (decl.type.kind == "PointerType") {
                fieldType = ClavaJoinPoints.pointer(fieldType);
            }

            const newVar = ClavaJoinPoints.varDeclNoInit(newVarName, fieldType);
            newVars.push([fieldName, newVar]);
        }

        return newVars;
    }

    private createNewVarsWithInit(decl: Vardecl, struct: Struct): [string, Vardecl][] {

        let initVars: [string, Vardecl][] = [];

        const decomposers: StructAssignmentDecomposer[] = [
            new DirectListAssignment(),
            new PointerListAssignment(),
            new MallocAssignment(),
            new StructToStructAssignment()
        ];
        for (const decomposer of decomposers) {
            if (decomposer.validate(decl)) {
                return decomposer.decompose(decl, struct);
            }
        }

        this.logWarning("Could not decompose init: " + decl.code);
        return initVars;
    }

    private replaceRef(ref: Varref, fieldDecls: [string, Vardecl][]): void {
        // If the varref is a member access, replace it with a ref to the field decl
        if (ref.parent instanceof MemberAccess) {
            this.replaceRefByField(ref, fieldDecls);
        }
        // Struct-to-struct assignment, e.g., foo = bar
        else if (ref.getAncestor("binaryOp") != null) {
            const binaryOp = ref.getAncestor("binaryOp") as BinaryOp;

            if (binaryOp.kind === "assign") {
                const leftRef = Query.searchFromInclusive(binaryOp.left, Varref).first() as Varref;
                const rightRef = Query.searchFromInclusive(binaryOp.right, Varref).first() as Varref;

                this.replaceRefByAllFields(leftRef, rightRef, fieldDecls);
                binaryOp.parent.detach();
            }
        }
        // Struct passed as argument to a function, e.g., doSomething(bar)
        else if (ref.isFunctionArgument) {
            this.replaceRefArg(ref, fieldDecls);
        }
        // Unknown case
        else {
            this.logWarning(`Could not replace ref: ${ref.parent.parent.code}`);
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

    private replaceRefByAllFields(leftRef: Varref, rightRef: Varref, fieldDecls: [string, Vardecl][]): void {
        const rhsIsDeref = rightRef.parent instanceof UnaryOp && rightRef.parent.kind === "deref";
        const rhsIsAddrOf = rightRef.parent instanceof UnaryOp && rightRef.parent.kind === "addr_of";
        const rhsIsPointer = rightRef.type.isPointer;
        const lhsIsPointer = leftRef.type.isPointer;

        const newExprs: ExprStmt[] = [];

        for (const [fieldName, fieldDecl] of fieldDecls) {
            const lhsVarName = `${leftRef.name}_${fieldName}`;
            const rhsVarName = `${rightRef.name}_${fieldName}`;

            if (!lhsIsPointer && !rhsIsPointer) {
                const newLhs = ClavaJoinPoints.varRef(lhsVarName, fieldDecl.type);
                const newRhs = ClavaJoinPoints.varRef(rhsVarName, fieldDecl.type);
                const assign = ClavaJoinPoints.binaryOp("=", newLhs, newRhs);
                const stmt = ClavaJoinPoints.exprStmt(assign);

                newExprs.push(stmt);
            }
            else if (!lhsIsPointer && rhsIsPointer && rhsIsDeref) {
                const newLhs = ClavaJoinPoints.varRef(lhsVarName, fieldDecl.type);
                const pointerType = ClavaJoinPoints.pointer(fieldDecl.type);
                const newRhs = ClavaJoinPoints.varRef(rhsVarName, pointerType);
                const deref = ClavaJoinPoints.unaryOp("*", newRhs);
                const assign = ClavaJoinPoints.binaryOp("=", newLhs, deref);
                const stmt = ClavaJoinPoints.exprStmt(assign);

                newExprs.push(stmt);
            }
            else if (lhsIsPointer && rhsIsPointer) {
                const pointerType = ClavaJoinPoints.pointer(fieldDecl.type);
                const newRhs = ClavaJoinPoints.varRef(rhsVarName, pointerType);
                const newLhs = ClavaJoinPoints.varRef(lhsVarName, pointerType);
                const assign = ClavaJoinPoints.binaryOp("=", newLhs, newRhs);
                const stmt = ClavaJoinPoints.exprStmt(assign);

                newExprs.push(stmt);
            }
            else if (lhsIsPointer && !rhsIsPointer && rhsIsAddrOf) {
                const pointerType = ClavaJoinPoints.pointer(fieldDecl.type);
                const newRhs = ClavaJoinPoints.varRef(rhsVarName, fieldDecl.type);
                const addrOf = ClavaJoinPoints.unaryOp("&", newRhs);
                const newLhs = ClavaJoinPoints.varRef(lhsVarName, pointerType);
                const assign = ClavaJoinPoints.binaryOp("=", newLhs, addrOf);
                const stmt = ClavaJoinPoints.exprStmt(assign);

                newExprs.push(stmt);
            }
        }
        for (const expr of newExprs) {
            leftRef.parent.insertAfter(expr);
        }
    }

    private replaceRefArg(ref: Varref, fieldDecls: [string, Vardecl][]): void {
        const call = ref.getAncestor("call") as Call;
        const newArgs = [];

        for (let i = 0; i < call.args.length; i++) {
            const arg = call.args[i] as Expression;

            // doSomething(Data bar) -> Data bar; doSomething(bar)
            // doSomething(Data *bar) -> Data *bar; doSomething(bar)
            if (arg instanceof Varref && arg.name === ref.name) {
                for (const [_, newVar] of fieldDecls) {
                    const newArg = ClavaJoinPoints.varRef(newVar);
                    newArgs.push(newArg);
                }
            }
            // doSomething(Data bar) -> Data *bar; doSomething(*bar)
            else if (arg instanceof UnaryOp && arg.kind === "deref" && arg.children[0] instanceof Varref) {
                for (const [_, newVar] of fieldDecls) {
                    const newRef = ClavaJoinPoints.varRef(newVar);
                    const newArg = ClavaJoinPoints.unaryOp("*", newRef);
                    newArgs.push(newArg);
                }
            }
            // doSomething(Data *bar) -> Data bar; doSomething(&bar)
            else if (arg instanceof UnaryOp && arg.kind === "addr_of" && arg.children[0] instanceof Varref) {
                for (const [_, newVar] of fieldDecls) {
                    const newRef = ClavaJoinPoints.varRef(newVar);
                    const newArg = ClavaJoinPoints.unaryOp("&", newRef);
                    newArgs.push(newArg);
                }
            }
            else {
                newArgs.push(arg);
            }
        }
        const newCall = ClavaJoinPoints.call(call.function, ...newArgs);
        call.replaceWith(newCall);
    }

    private getAllParamsOfStruct(name: string): Param[] {
        const params = [];

        for (const decl of Query.search(Param)) {
            const type = decl.type;
            const typeName = type.code.replace("*", "").replace("struct ", "").trim();
            const parentFun = decl.getAncestor("function") as FunctionJp;
            const hasParentFunction = parentFun != undefined && parentFun.isImplementation;

            if (typeName === name && decl.isParam && hasParentFunction) {
                params.push(decl);
            }
        }
        return params;
    }

    private decomposeParam(param: Param, struct: Struct): void {
        const fun = param.getAncestor("function") as FunctionJp;
        const scope = fun.body;

        const fieldParams = this.replaceParamByFields(param, struct);

        for (const varref of Query.searchFrom(scope, Varref)) {
            if (varref.name === param.name) {
                this.replaceRef(varref, fieldParams);
            }
        }
    }

    private replaceParamByFields(param: Param, struct: Struct): [string, Param][] {
        const newVars = this.createNewVarsNoInit(param, struct);
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

        return newParams;
    }
}

