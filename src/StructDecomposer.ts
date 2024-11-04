import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js"
import { BinaryOp, Call, Class, DeclStmt, Expression, Field, FileJp, FunctionJp, Joinpoint, MemberAccess, Param, Statement, Struct, TypedefDecl, UnaryOp, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import { DirectListAssignment, MallocAssignment, PointerListAssignment, StructAssignmentDecomposer, StructToStructAssignment } from "./StructAssignmentDecomp.js";
import { AdvancedTransform } from "./AdvancedTransform.js";

export class StructDecomposer extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("StructDecomposer", silent);
    }

    public decomposeAll(): string[] {
        const structs = this.findAllStructs();
        this.log(`Found ${structs.length} regular structs`);

        const classes = this.findAllStructlikeClasses();
        this.log(`Found ${classes.length} structs aliased as classes`);

        const decompNames: string[] = [];

        structs.forEach(([name, struct]) => {
            this.decompose(struct.fields, name);
            decompNames.push(name);
        });
        classes.forEach(([name, classJp]) => {
            this.decompose(classJp.fields, name);
            decompNames.push(name);
        });

        return decompNames;
    }

    public decomposeByName(name: string): void {
        for (const struct of Query.search(Struct)) {
            const structName = this.getStructName(struct);

            if (structName === name) {
                this.decompose(struct.fields, name);
            }
        }
    }

    public decomposeStruct(struct: Struct): void {
        const name = this.getStructName(struct);
        this.decompose(struct.fields, name);
    }

    // -----------------------------------------------------------------------
    private decompose(fields: Field[], name: string): void {
        this.log(`Decomposing struct "${name}" with ${fields.length} field(s)`);

        const decls = this.getAllDeclsOfStruct(name);
        this.log(`Found ${decls.length} declarations for struct "${name}"`);

        for (const decl of decls) {
            this.decomposeDeclAndRefs(decl, fields);
        }

        const params = this.getAllParamsOfStruct(name);
        this.log(`Found ${params.length} params for struct "${name}"`);

        for (const param of params) {
            this.decomposeParam(param, fields);
        }
    }

    private findAllStructs(): [string, Struct][] {
        const structs: [string, Struct][] = [];

        for (const struct of Query.search(Struct)) {
            const name = this.getStructName(struct);
            structs.push([name, struct]);
        }
        return structs;
    }

    private findAllStructlikeClasses(): [string, Class][] {
        const classes: Map<string, Class> = new Map();

        for (const file of Query.search(FileJp)) {
            for (const stmt of file.children) {
                if (stmt instanceof Class) {
                    const classJp = stmt as Class;
                    let name = classJp.name;

                    let isStruct = false;
                    for (const typedef of Query.searchFrom(classJp, TypedefDecl)) {
                        if (typedef.type.code.trim() == "struct") {
                            isStruct = true;
                            name = typedef.name;
                        }
                    }

                    if (isStruct) {
                        classes.set(name, classJp);
                    }
                }
            }
        }
        return Array.from(classes);
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
        const newVars: [string, Vardecl][] = decl.hasInit ?
            this.createNewVarsWithInit(decl, fields) :
            this.createNewVarsNoInit(decl, fields);

        for (const [_, newVar] of newVars.reverse()) {
            const parentStmt = decl.getAncestor("declStmt") as DeclStmt;
            const wrappedDecl = ClavaJoinPoints.declStmt(newVar);
            parentStmt.insertAfter(wrappedDecl);
        }

        return newVars;
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

            const newVar = ClavaJoinPoints.varDeclNoInit(newVarName, fieldType);
            newVars.push([fieldName, newVar]);
        }

        return newVars;
    }

    private createNewVarsWithInit(decl: Vardecl, fields: Field[]): [string, Vardecl][] {

        let initVars: [string, Vardecl][] = [];

        const decomposers: StructAssignmentDecomposer[] = [
            new DirectListAssignment(),
            new PointerListAssignment(),
            new MallocAssignment(),
            new StructToStructAssignment()
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

        const newExprs: Statement[] = [];

        for (const [fieldName, fieldDecl] of fieldDecls) {
            const lhsVarName = `${leftRef.name}_${fieldName}`;
            const rhsVarName = `${rightRef.name}_${fieldName}`;

            if (!lhsIsPointer && !rhsIsPointer) {
                if (fieldDecl.type.isArray) {
                    const memcpyStr = `memcpy(&${lhsVarName}, &${rhsVarName}, sizeof(${rhsVarName}) / sizeof(${rhsVarName}[0]));`;
                    const memcpy = ClavaJoinPoints.stmtLiteral(memcpyStr);
                    const newLhs = ClavaJoinPoints.varRef(lhsVarName, fieldDecl.type);
                    const stmt = ClavaJoinPoints.exprStmt(newLhs);

                    newExprs.push(memcpy);
                    newExprs.push(stmt);
                }
                else {
                    const newLhs = ClavaJoinPoints.varRef(lhsVarName, fieldDecl.type);
                    const newRhs = ClavaJoinPoints.varRef(rhsVarName, fieldDecl.type);
                    const assign = ClavaJoinPoints.binaryOp("=", newLhs, newRhs);
                    const stmt = ClavaJoinPoints.exprStmt(assign);

                    newExprs.push(stmt);
                }
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

        return newParams;
    }
}

