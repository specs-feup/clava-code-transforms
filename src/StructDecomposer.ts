import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js"
import { BinaryOp, Call, FloatLiteral, FunctionJp, ImplicitValue, InitList, IntLiteral, Joinpoint, Literal, MemberAccess, Param, Struct, TypedefDecl, UnaryOp, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import { AstDumper } from "../test/AstDumper.js";

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

        const params = this.getAllParamsOfStruct(name);
        this.log(`Found ${params.length} parameters for struct "${name}"`);

        for (const param of params) {
            this.decomposeParam(param, struct);
        }

        for (const decl of decls) {
            this.decomposeDecl(decl, struct);
        }

        for (const param of params) {
            this.removeStructParam(param);
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
                //println(`decl: ${decl.name}, kind: ${type.kind}, type: "${typeName}"`);
                decls.push(decl);
            }
        }
        return decls;
    }

    private getAllParamsOfStruct(name: string): Param[] {
        const params = [];

        for (const decl of Query.search(Param)) {
            const type = decl.type;
            const typeName = type.code.replace("*", "").replace("struct ", "").trim();
            const parentFun = decl.getAncestor("function") as FunctionJp;
            const hasParentFunction = parentFun != undefined && parentFun.isImplementation;

            if (typeName === name && decl.isParam && hasParentFunction) {
                //println(`decl: ${decl.name}, kind: ${type.kind}, type: "${typeName}"`);
                params.push(decl);
            }
        }
        return params;
    }

    private decomposeDecl(decl: Vardecl, struct: Struct): [string, Vardecl][] {
        // Find all struct decls (local and global), and create vars for each field
        const newVars: [string, Vardecl][] = decl.hasInit ?
            this.createNewVarsWithInit(decl, struct) :
            this.createNewVarsNoInit(decl, struct);

        for (const [fieldName, newVar] of newVars.reverse()) {
            decl.insertAfter(newVar);
        }

        // Replace all references to the struct fields with the new vars
        this.replaceFieldRefs(decl, newVars);

        // Replace all references to the struct itself in function calls
        this.replaceRefsInCalls(decl, newVars);

        return newVars;
    }

    private decomposeParam(param: Param, struct: Struct): void {
        // Find all struct params, and create params for each field
        const newParams = this.createNewParams(param, struct);

        // Replace all references to the struct fields with the new params
        this.replaceFieldRefs(param, newParams);
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
        console.log("Init: " + decl.code + "\n");
        const ast = new AstDumper().dump(decl);
        console.log(ast);

        let initVars: [string, Vardecl][] = [];

        const decomposers: StructInitDecomposer[] = [
            new DirectListAssignment(),
            new PointerListAssignment()
        ];
        for (const decomposer of decomposers) {
            if (decomposer.validate(decl)) {
                return decomposer.decompose(decl, struct);
            }
        }
        return initVars;
    }

    private createNewParams(param: Param, struct: Struct): [string, Param][] {
        const newParams: [string, Param][] = [];
        const paramsOrdered = [];
        const declName = param.name;

        console.log(`${param.filename}:${param.line}`);
        const fun = param.getAncestor("function") as FunctionJp;

        for (const field of struct.fields) {
            const fieldName = field.name;
            const newParamName = `${declName}_${fieldName}`;

            let fieldType = field.type;
            if (param.type.kind == "PointerType") {
                fieldType = ClavaJoinPoints.pointer(fieldType);
            }

            const newParam = ClavaJoinPoints.param(newParamName, fieldType);
            newParams.push([fieldName, newParam]);
            paramsOrdered.push(newParam);
        }

        // update function signature with the new params, removing the previous struct
        const preParams = [];
        const postParams = [];
        let found = false;

        for (const funParam of fun.params) {
            if (funParam.name === param.name) {
                preParams.push(funParam);
                found = true;
            }
            else if (!found) {
                postParams.push(funParam);
            }
            else {
                preParams.push(funParam);
            }
        }
        const finalParams = [...preParams, ...paramsOrdered, ...postParams];
        fun.setParams(finalParams);

        return newParams;
    }

    private replaceFieldRefs(decl: Vardecl, newVars: [string, Vardecl][]): void {
        const declName = decl.name;

        let startingPoint;
        if (decl.isGlobal) {
            startingPoint = decl.root;
        }
        else if (decl.isParam) {
            startingPoint = decl.parent;
        }
        else {
            startingPoint = decl.currentRegion;
        }

        for (const ref of Query.searchFrom(startingPoint, Varref)) {
            if (ref.name === declName && ref.parent instanceof MemberAccess) {
                const fieldAccess = ref.parent as MemberAccess;
                const fieldName = fieldAccess.name;

                const nameAndVardecl = newVars.find(([name, varDecl]) => name === fieldName);
                if (!nameAndVardecl) {
                    continue;
                }
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
        }
    }

    private replaceRefsInCalls(decl: Vardecl, newVars: [string, Vardecl][]): void {
        const declName = decl.name;

        let startingPoint;
        if (decl.isGlobal) {
            startingPoint = decl.root;
        }
        else {
            startingPoint = decl.currentRegion;
        }

        const callsToReplace = [];
        for (const call of Query.searchFrom(startingPoint, Call)) {
            const idxToReplace: Map<number, Varref> = new Map();

            for (let i = 0; i < call.args.length; i++) {
                const arg = call.args[i] as Varref;
                let varref = null;

                if (arg instanceof Varref && arg.name === declName) {
                    varref = arg;
                }
                else {
                    for (const ref of Query.searchFrom(arg, Varref)) {
                        if (ref.name === declName) {
                            varref = ref;
                            break;
                        }
                    }
                }
                if (varref) {
                    idxToReplace.set(i, varref);
                }
            }
            if (idxToReplace.size === 0) {
                continue;
            }

            const newCall = this.makeNewCall(call, idxToReplace, newVars, decl);
            callsToReplace.push([call, newCall]);
        }

        for (const [oldCall, newCall] of callsToReplace) {
            oldCall.replaceWith(newCall);
        }
    }


    private makeNewCall(call: Call, idxToReplace: Map<number, Varref>, newVars: [string, Vardecl][], decl: Vardecl): Call {
        const finalArgList = [];

        for (let i = 0; i < call.args.length; i++) {
            if (idxToReplace.has(i)) {
                const argToReplace = idxToReplace.get(i);
                if (!argToReplace) {
                    continue;
                }
                const newArgs = this.makeNewArgs(argToReplace, newVars/*, decl*/);
                finalArgList.push(...newArgs);
            }
            else {
                finalArgList.push(call.args[i]);
            }
        }

        //console.log(call.name + " -> " + finalArgList.length);
        const fun = call.function;
        const newCall = ClavaJoinPoints.call(fun, ...finalArgList);
        return newCall;
    }

    private makeNewArgs(arg: Varref, newVars: [string, Vardecl][]): (Varref | UnaryOp)[] {
        const newArgs = [];

        let isAddrOf = false;
        let isDeref = false;

        if (arg.parent instanceof UnaryOp) {
            isAddrOf = arg.parent.kind === "addr_of";
            isDeref = arg.parent.kind === "deref";
        }

        for (const [field, newFieldVar] of newVars) {
            const newArgType = newFieldVar.type;
            const newArg = ClavaJoinPoints.varRef(newFieldVar.name, newArgType);

            if (isAddrOf) {
                const addrOfNewArg = ClavaJoinPoints.unaryOp("&", newArg);
                newArgs.push(addrOfNewArg);
            }
            else if (isDeref) {
                const derefNewArg = ClavaJoinPoints.unaryOp("*", newArg);
                newArgs.push(derefNewArg);
            }
            else {
                newArgs.push(newArg);
            }
        }
        return newArgs;
    }

    private removeStructParam(param: Param): void {
        const fun = param.parent as FunctionJp;
        const newParams = [];

        for (const funParam of fun.params) {
            if (funParam.name !== param.name) {
                newParams.push(funParam);
            }
        }
        fun.setParams(newParams);
    }
}

interface StructInitDecomposer {
    validate(decl: Vardecl): boolean;
    decompose(decl: Vardecl, struct: Struct): [string, Vardecl][];
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
class DirectListAssignment implements StructInitDecomposer {
    validate(decl: Vardecl): boolean {
        const cond1 = decl.children.length === 1;
        if (!cond1) {
            return false;
        }
        const cond2 = decl.children[0] instanceof InitList;
        if (!cond2) {
            return false;
        }
        return true;
    }

    decompose(decl: Vardecl, struct: Struct): [string, Vardecl][] {
        const newVars: [string, Vardecl][] = [];

        const initList = decl.children[0] as InitList;
        const fields = struct.fields;

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
                console.log(`[DirectListAssignment] Unknown init of type ${fieldInit.joinPointType}`);
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
class PointerListAssignment implements StructInitDecomposer {
    validate(decl: Vardecl): boolean {
        const cond1 = decl.children.length === 1;
        const cond2 = decl.children[0] instanceof UnaryOp && decl.children[0].kind === "addr_of";
        const cond3 = decl.children[0].children[0] instanceof Literal;
        const cond4 = decl.children[0].children[0].children[0] instanceof InitList;
        if (!(cond1 && cond2 && cond3 && cond4)) {
            return false;
        }
        return true;
    }

    decompose(decl: Vardecl, struct: Struct): [string, Vardecl][] {
        const newVars: [string, Vardecl][] = [];

        const initList = decl.children[0].children[0].children[0] as InitList;
        const fields = struct.fields;

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
                console.log(`[DirectListAssignment] Unknown init of type ${fieldInit.joinPointType}`);
                const newVar = ClavaJoinPoints.varDeclNoInit(newVarName, field.type);
                newVars.push([fieldName, newVar]);
            }
        }

        return newVars;
    }
}