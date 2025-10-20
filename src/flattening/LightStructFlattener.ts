import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js"
import { ArrayType, Call, DeclStmt, Expression, ExprStmt, Field, FunctionJp, IncompleteArrayType, MemberAccess, Param, Statement, Type, Vardecl, VariableArrayType, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { StructFlatteningAlgorithm } from "./StructFlatteningAlgorithm.js";
import { Voidifier } from "../function/Voidifier.js";

export class LightStructFlattener extends StructFlatteningAlgorithm {
    constructor(silent: boolean = false) {
        super("StructFlattener", silent);
    }

    public decompose(fields: Field[], name: string, functions: FunctionJp[]): void {
        functions.forEach((fun) => {
            this.flattenInFunction(fun, fields, name);
        });

        const topFunction = functions[0];
        if (topFunction) {
            this.buildTopFunctionInterface(name, topFunction, fields);
        }
    }

    // -----------------------------------------------------------------------
    private flattenInFunction(fun: FunctionJp, fields: Field[], name: string) {
        this.log("----------------------------------------------------------------------");
        this.log(`Flattening struct ${name} in function ${fun.name}`);
        let changes = 0;
        changes += this.flattenParams(fun, fields, name);
        changes += this.flattenMemberRefs(fun, fields, name);
        changes += this.flattenDecls(fun, fields, name);
        changes += this.flattenAssignments(fun, fields, name);
        changes += this.flattenCalls(fun, fields, name);

        if (changes > 0) {
            this.log(`Flattened all ${changes} occurrences of struct ${name} in function ${fun.name}`);
        } else {
            this.log(`No occurrences of struct ${name} found in function ${fun.name}`);
        }
    }

    private flattenParams(fun: FunctionJp, fields: Field[], name: string): number {
        const idxToFlatten: number[] = [];

        for (let i = 0; i < fun.params.length; i++) {
            const param = fun.params[i];
            if (param.type.code.includes(name)) {
                idxToFlatten.push(i);
            }
        }
        const newParamList: Param[] = [];

        for (let i = 0; i < fun.params.length; i++) {
            const param = fun.params[i];
            if (!idxToFlatten.includes(i)) {
                newParamList.push(param);
                continue;
            }
            else {
                const newParams = this.flattenParam(param, fields);
                newParamList.push(...newParams);
                this.log(`  Flattened param ${param.name}`);
            }
        };
        fun.setParams(newParamList);

        return idxToFlatten.length;
    }

    private flattenParam(param: Param, fields: Field[]): Param[] {
        // assuming params are structs, not arrays of structs
        const type = param.type;
        const isPointer = type.isPointer;

        const newParams: Param[] = [];
        fields.forEach((field) => {
            const newParamName = `${param.name}_${field.name}`;
            const baseType = this.getBaseType(field.type);
            const newParamType = isPointer ? ClavaJoinPoints.pointer(baseType) : baseType;
            const newParam = ClavaJoinPoints.param(newParamName, newParamType);
            newParams.push(newParam);
        });
        return newParams;
    }

    private flattenMemberRefs(fun: FunctionJp, fields: Field[], name: string): number {
        let changes = 0;

        for (const ref of Query.searchFrom(fun, Varref)) {
            const type = ref.type;
            if (type.code.includes(name)) {
                const member = ref.parent;

                if (member instanceof MemberAccess) {
                    const fieldName = member.name;
                    const newVarrefName = `${ref.name}_${fieldName}`;
                    const newVarref = ClavaJoinPoints.exprLiteral(newVarrefName);

                    if (member.arrow) {
                        //foo->bar, where bar is a scalar
                        if (!this.fieldIsArray(member, fields)) {
                            const deref = ClavaJoinPoints.exprLiteral(`(*${newVarrefName})`);
                            member.replaceWith(deref);
                        }
                        //foo->bar, where bar is an array
                        else {
                            member.replaceWith(newVarref);
                        }
                    }
                    else {
                        //foo.bar, where bar is anything
                        member.replaceWith(newVarref);
                    }
                    changes++;
                }
            }
        }
        return changes;
    }

    private flattenDecls(fun: FunctionJp, fields: Field[], name: string): number {
        let changes = 0;
        const toRemove: DeclStmt[] = [];

        Query.searchFrom(fun, Vardecl).get().forEach((decl) => {
            const type = decl.type;

            if (type.code.includes(name)) {
                const newDecls = this.flattenDecl(decl, fields);

                const parent = decl.parent;
                newDecls.forEach((newDecl) => {
                    parent.insertBefore(newDecl);
                });
                toRemove.push(decl.parent as DeclStmt);

                this.log(`  Flattened decl ${decl.name}`);
                changes++;
            }
        });
        toRemove.forEach((declStmt) => {
            declStmt.detach();
        });
        return changes;
    }

    private flattenDecl(decl: Vardecl, fields: Field[]): DeclStmt[] {
        const declStmts: DeclStmt[] = [];

        fields.forEach((field) => {
            const newDeclName = `${decl.name}_${field.name}`;
            const baseType = this.getBaseType(field.type);
            const newDeclType = decl.type.isPointer ? ClavaJoinPoints.pointer(baseType) : baseType;
            const newDecl = ClavaJoinPoints.varDeclNoInit(newDeclName, newDeclType);
            const declStmt = ClavaJoinPoints.declStmt(newDecl);
            declStmts.push(declStmt);
        });
        return declStmts;
    }

    private flattenAssignments(fun: FunctionJp, fields: Field[], name: string) {
        return 0;
    }

    private flattenCalls(fun: FunctionJp, fields: Field[], name: string) {
        let changes = 0;

        Query.searchFrom(fun, Call).get().forEach((call) => {
            changes += this.flattenCall(call, fields, name);
        });
        return changes;
    }

    private flattenCall(call: Call, fields: Field[], name: string): number {
        let changes = 0;

        const idxToFlatten: number[] = [];
        for (let i = 0; i < call.args.length; i++) {
            const arg = call.args[i];
            // we assume that any foo->bar or foo.bar is already flattened
            // so there are only struct refs left to flatten at this point
            if (arg.type.code.includes(name)) {
                idxToFlatten.push(i);
            }
        }
        if (idxToFlatten.length === 0) {
            return changes;
        }

        const flattenedNames: string[] = [];
        const newArgList: Expression[] = [];
        for (let i = 0; i < call.args.length; i++) {
            const arg = call.args[i];
            if (!idxToFlatten.includes(i)) {
                newArgList.push(arg);
                continue;
            }
            else {
                flattenedNames.push(arg.code);
                const newArgs = this.flattenCallArg(arg, fields);
                newArgList.push(...newArgs);
                changes += 1;
            }
        };
        this.updateCallWithNewArgs(call, newArgList, fields);

        this.log(`  Flattened args {${flattenedNames.join(", ")}} in call to ${call.name}`);
        return changes;
    }

    private flattenCallArg(arg: Expression, fields: Field[]): Expression[] {
        const newArgs: Expression[] = [];
        let [prefix, argName, suffix] = ["", arg.code, ""];

        // this only works because we know we only have expr that are at most (*argName) or (&argName)
        if (arg.code.includes("(")) {
            const openIdx = arg.code.indexOf("(");
            const closeIdx = arg.code.lastIndexOf(")");
            prefix = arg.code.substring(0, openIdx + 1);
            argName = arg.code.substring(openIdx + 1, closeIdx);
            suffix = arg.code.substring(closeIdx);
        }

        fields.forEach((field) => {
            const newArgName = `${argName}_${field.name}`;
            const newArg = ClavaJoinPoints.exprLiteral(newArgName);
            newArgs.push(newArg);
        });
        return newArgs;
    }

    private updateCallWithNewArgs(call: Call, newArgs: Expression[], fields: Field[]): void {
        if (call.name == "free") {
            if (newArgs.length > 1) {
                const parentExpr = call.parent;
                if (!(parentExpr instanceof ExprStmt)) {
                    throw new Error(`Expected parent of free call to be an ExprStmt, but got ${parentExpr?.joinPointType}`);
                }

                const newCalls: ExprStmt[] = [];
                fields.forEach((field, index) => {
                    if (field.type.isPointer || field.type.isArray) {
                        const funName = "free";
                        const funRetType = ClavaJoinPoints.type("void");
                        const arg = newArgs[index];

                        const newCall = ClavaJoinPoints.callFromName(funName, funRetType, arg);
                        const newExpr = ClavaJoinPoints.exprStmt(newCall);
                        newCalls.push(newExpr);
                    }
                });
                newCalls.forEach((newCall) => {
                    parentExpr.insertBefore(newCall);
                });
                parentExpr.detach();
            }
            else {
                call.setArg(0, newArgs[0]);
            }
        }
        else {
            const currNArgs = call.args.length;
            for (let i = 0; i < currNArgs; i++) {
                call.setArg(i, newArgs[i]);
            }
            for (let i = currNArgs; i < newArgs.length; i++) {
                call.addArg(newArgs[i].code, newArgs[i].type);
            }
        }
    }

    private buildTopFunctionInterface(name: string, topFunction: FunctionJp, fields: Field[]) {
        this.log("----------------------------------------------------------------------");
        this.log(`Building struct to flat mapping for struct ${name} before calls to ${topFunction.name}()`);
        for (const call of Query.search(Call, { name: topFunction.name })) {
            this.buildStructToFlatMap(fields, name, call);
        }
        this.log("----------------------------------------------------------------------");
    }

    private buildStructToFlatMap(fields: Field[], structName: string, call: Call): void {
        this.log(`Building ${structName} mapping at call spot ${call.name}():${call.line}`);

        const newVars = new Map<string, DeclStmt>();

        for (const arg of call.argList) {
            const strippedArgName = arg.code.replace("*", "").replace("&", "").replace("(", "").replace(")", "").trim();
            const argType = this.getBaseType(arg.type);

            if (argType.code.includes(structName)) {
                fields.forEach((field) => {
                    const newVarName = `${strippedArgName}_${field.name}`;
                    const baseType = this.getBaseType(field.type);
                    const newVarType = arg.type.isPointer ? ClavaJoinPoints.pointer(baseType) : baseType;

                    const init = arg.type.isPointer ?
                        ClavaJoinPoints.exprLiteral(`&(${strippedArgName}->${field.name})`) :
                        ClavaJoinPoints.exprLiteral(`${strippedArgName}.${field.name}`);
                    init.setType(newVarType);

                    const newVarDecl = ClavaJoinPoints.varDecl(newVarName, init);
                    const newDeclStmt = ClavaJoinPoints.declStmt(newVarDecl);
                    newVars.set(newVarName, newDeclStmt);
                });
            }
        }
        const parentStmt = call.parent;
        newVars.forEach((declStmt) => {
            parentStmt.insertBefore(declStmt);
        });

        this.flattenCall(call, fields, structName);
    }

    // -----------------------------------------------------------------------
    private getBaseType(type: Type): Type {
        const typeStr = type.code.replace("*", "").replace("&", "").replace("const", "").replace("[]", "").trim();
        return ClavaJoinPoints.type(typeStr);
    }

    private fieldIsArray(member: MemberAccess, fields: Field[]): boolean {
        const field = fields.find((f) => f.name === member.name);
        if (field) {
            return field.type.code.includes("[]") || field.type instanceof ArrayType || field.type instanceof IncompleteArrayType || field.type instanceof VariableArrayType;
        }
        return false;
    }
}