import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js"
import { Call, FunctionJp, Joinpoint, MemberAccess, Param, Struct, TypedefDecl, UnaryOp, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js"

export class StructDecomposer {
    #silent;

    constructor(silent = false) {
        this.#silent = silent;
    }

    decomposeAll() {
        const structs: { [key: string]: Struct } = {};

        for (const struct of Query.search(Struct)) {
            const name = this.#getStructName(struct);
            structs[name] = struct;
        }
        this.#log(`Found ${Object.keys(structs).length} eligible structs`);

        const decompNames = [];
        for (const structName in structs) {
            const struct = structs[structName];
            this.decompose(struct, structName);
            this.#log("------------------------------");
            decompNames.push(structName);
        }
        return decompNames;
    }

    decomposeByName(nameOrNames: any) {
        const names = Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames];
        this.#log(`Structs to decompose: ${names.join(", ")}`);

        const decompNames = [];
        for (const name of names) {
            for (const struct of Query.search(Struct)) {
                const structName = this.#getStructName(struct);

                if (structName === name) {
                    this.decompose(struct, name);
                    this.#log("------------------------------");
                    decompNames.push(name);
                }
            }
        }
        return decompNames;
    }

    decompose(struct: Struct, name: string) {
        this.#log(`Decomposing struct "${name}"`);

        const decls = this.#getAllDeclsOfStruct(name);
        this.#log(`Found ${decls.length} declarations for struct "${name}"`);

        const params = this.#getAllParamsOfStruct(name);
        this.#log(`Found ${params.length} parameters for struct "${name}"`);

        for (const param of params) {
            this.#decomposeParam(param, struct);
        }

        for (const decl of decls) {
            this.#decomposeDecl(decl, struct);
        }

        for (const param of params) {
            this.#removeStructParam(param);
        }

        for (const decl of decls) {
            this.#removeInits(decl, struct);
        }
    }

    #log(msg: string) {
        if (!this.#silent) {
            console.log(`[StructDecomp] ${msg}`);
        }
    }

    #getStructName(struct: Struct) {
        let name: string = struct.name;

        // typedef struct { ... } typedef_name;
        if (struct.name === "") {
            const jp: Joinpoint = struct.children[struct.children.length - 1].children[0];
            const typedef = jp as TypedefDecl;
            name = typedef.name;
        }
        return name;
    }

    #getAllDeclsOfStruct(name: string) {
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

    #getAllParamsOfStruct(name: string) {
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

    #decomposeDecl(decl: Vardecl, struct: Struct) {
        // Find all struct decls (local and global), and create vars for each field
        const newVars = this.#createNewVars(decl, struct);

        // Replace all references to the struct fields with the new vars
        this.#replaceFieldRefs(decl, newVars);

        // Replace all references to the struct itself in function calls
        this.#replaceRefsInCalls(decl, newVars);
    }

    #decomposeParam(param: Param, struct: Struct) {
        // Find all struct params, and create params for each field
        const newParams = this.#createNewParams(param, struct);

        // Replace all references to the struct fields with the new params
        this.#replaceFieldRefs(param, newParams);
    }

    #createNewVars(decl: Vardecl, struct: Struct): [string, Vardecl][] {
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
            decl.insertAfter(newVar);
            newVars.push([fieldName, newVar]);
        }

        return newVars;
    }

    #createNewParams(param: Param, struct: Struct): [string, Param][] {
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

    #replaceFieldRefs(decl: Vardecl, newVars: [string, Vardecl][]) {
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
            if (ref.name === declName && ref.parent.instanceOf("memberAccess")) {
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
                    if (fieldAccess.parent.instanceOf("binaryOp") && fieldAccess.parent.rightJp == fieldAccess) {
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

    #replaceRefsInCalls(decl: Vardecl, newVars: [string, Vardecl][]) {
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

                if (arg.instanceOf("varref") && arg.name === declName) {
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

            const newCall = this.#makeNewCall(call, idxToReplace, newVars, decl);
            callsToReplace.push([call, newCall]);
        }

        for (const [oldCall, newCall] of callsToReplace) {
            oldCall.replaceWith(newCall);
        }
    }


    #makeNewCall(call: Call, idxToReplace: Map<number, Varref>, newVars: [string, Vardecl][], decl: Vardecl) {
        const finalArgList = [];

        for (let i = 0; i < call.args.length; i++) {
            if (idxToReplace.has(i)) {
                const argToReplace = idxToReplace.get(i);
                if (!argToReplace) {
                    continue;
                }
                const newArgs = this.#makeNewArgs(argToReplace, newVars/*, decl*/);
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

    #makeNewArgs(arg: Varref, newVars: [string, Vardecl][]) {
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

    #removeStructParam(param: Param) {
        const fun = param.parent as FunctionJp;
        const newParams = [];

        for (const funParam of fun.params) {
            if (funParam.name !== param.name) {
                newParams.push(funParam);
            }
        }
        fun.setParams(newParams);
    }

    #removeInits(decl: Vardecl, struct: Struct) {

    }
}