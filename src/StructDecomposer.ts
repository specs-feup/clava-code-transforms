import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js"
import { BinaryOp, Call, Expression, FunctionJp, Joinpoint, MemberAccess, Param, Struct, TypedefDecl, UnaryOp, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import { AstDumper } from "../test/AstDumper.js";
import { DirectListAssignment, MallocAssignment, PointerListAssignment, StructAssignmentDecomposer } from "./StructAssignmentDecomp.js";

export class StructDecomposer {
    private silent;

    constructor(silent: boolean = false) {
        this.silent = silent;
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
            this.log("------------------------------");
            decompNames.push(structName);
        }
        return decompNames;
    }

    public decomposeByName(nameOrNames: string | string[]): string[] {
        const names = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
        this.log(`Structs to decompose: ${names.join(", ")}`);

        const decompNames = [];
        for (const name of names) {
            for (const struct of Query.search(Struct)) {
                const structName = this.getStructName(struct);

                if (structName === name) {
                    this.decompose(struct, name);
                    this.log("------------------------------");
                    decompNames.push(name);
                }
            }
        }
        return decompNames;
    }

    public decompose(struct: Struct, name: string): void {
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

    private log(msg: string): void {
        if (!this.silent) {
            console.log(`[StructDecomp] ${msg}`);
        }
    }

    private getStructName(struct: Struct): string {
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
        // First, decompose the declaration
        const fieldDecls = this.decomposeDecl(decl, struct);

        // Then, get the decl's scope to then find all references to the decl
        const scope = decl.getAncestor("scope")!;
        if (scope == null) {
            console.log("No scope found for decl: " + decl.name);
            return [];
        }

        for (const varref of Query.searchFrom(scope, Varref)) {
            if (varref.name === decl.name) {
                this.replaceRef(varref, fieldDecls);
            }
        }
        return fieldDecls;
    }

    private decomposeDecl(decl: Vardecl, struct: Struct): [string, Vardecl][] {
        const newVars: [string, Vardecl][] = decl.hasInit ?
            this.createNewVarsWithInit(decl, struct) :
            this.createNewVarsNoInit(decl, struct);

        for (const [_, newVar] of newVars.reverse()) {
            decl.insertAfter(newVar);
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
            new MallocAssignment()
        ];
        for (const decomposer of decomposers) {
            if (decomposer.validate(decl)) {
                return decomposer.decompose(decl, struct);
            }
        }

        this.log("Could not decompose init: " + decl.code + "\n");
        const ast = new AstDumper().dump(decl);
        console.log(ast);
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
                this.replaceRefByAllFields(ref, fieldDecls);
            }
        }
        // Struct passed as argument to a function, e.g., doSomething(bar)
        else if (ref.isFunctionArgument) {
            this.replaceRefArg(ref, fieldDecls);
        }
        // Unknown case
        else {
            this.log(`Could not replace ref: ${ref.code}`);
        }
    }

    private replaceRefByField(ref: Varref, fieldDecls: [string, Vardecl][]): void {
        const fieldAccess = ref.parent as MemberAccess;
        const fieldName = fieldAccess.name;

        console.log("fieldAccess: " + fieldAccess.code);
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

    private replaceRefByAllFields(ref: Varref, fieldDecls: [string, Vardecl][]): void {
        // TODO
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

