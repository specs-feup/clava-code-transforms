import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js"
import { ArrayType, Call, Expression, Field, FunctionJp, IncompleteArrayType, MemberAccess, Param, Statement, Type, VariableArrayType, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { StructFlatteningAlgorithm } from "./StructFlatteningAlgorithm.js";

export class LightStructFlattener extends StructFlatteningAlgorithm {
    constructor(silent: boolean = false) {
        super("StructFlattener", silent);
    }

    public decompose(fields: Field[], name: string): void {
        for (const fun of Query.search(FunctionJp)) {
            this.flattenInFunction(fun, fields, name);
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
        return 0;
    }

    private flattenAssignments(fun: FunctionJp, fields: Field[], name: string) {
        return 0;
    }

    private flattenCalls(fun: FunctionJp, fields: Field[], name: string) {
        let changes = 0;

        for (const call of Query.searchFrom(fun, Call)) {
            changes += this.flattenCall(call, fields, name);
        }
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

        const newArgList: Expression[] = [];
        for (let i = 0; i < call.args.length; i++) {
            const arg = call.args[i];
            if (!idxToFlatten.includes(i)) {
                newArgList.push(arg);
                continue;
            }
            else {
                const newArgs = this.flattenCallArg(arg, fields);
                newArgList.push(...newArgs);
                changes += 1;
            }
        };
        const currNArgs = call.args.length;
        for (let i = 0; i < currNArgs; i++) {
            call.setArg(i, newArgList[i]);
        }
        for (let i = currNArgs; i < newArgList.length; i++) {
            call.addArg(newArgList[i].code, newArgList[i].type);
        }
        return changes;
    }

    private flattenCallArg(arg: Expression, fields: Field[]): Expression[] {
        const newArgs: Expression[] = [];
        fields.forEach((field) => {
            const newArgName = `${arg.code}_${field.name}`;
            const newArg = ClavaJoinPoints.exprLiteral(newArgName);
            newArgs.push(newArg);
        });
        return newArgs;
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