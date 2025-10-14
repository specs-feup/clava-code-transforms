import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js"
import { ArrayAccess, ArrayType, BinaryOp, Call, Class, DeclStmt, Expression, Field, FileJp, FunctionJp, IncompleteArrayType, Joinpoint, MemberAccess, Param, Statement, Struct, Type, TypedefDecl, UnaryOp, Vardecl, VariableArrayType, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import { ArrayOfStructsDecl, DirectListDecl, MallocDecl, PointerListDecl, StructDeclFlattener, StructToStructDecl } from "./StructDeclFlattener.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import { ArrayToArrayAssignment, DerefToScalarAssignment, PointerToPointerAssignment, PointerToScalarAssignment, ScalarToScalarAssignment, StructToArrayPositionAssignment } from "./StructRefFlattener.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";

export class StructFlattener extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("StructFlattener", silent);
    }

    public flattenAll(): string[] {
        const structs = this.findAllStructs();
        this.log(`Found ${structs.length} regular structs`);

        const classes = this.findAllStructlikeClasses();
        this.log(`Found ${classes.length} structs aliased as classes`);

        const totalStructs = [
            ...structs,
            ...classes
        ];
        const decompNames: string[] = [];

        totalStructs.forEach(([name, struct]) => {
            this.log(`Flattening struct ${name}`);
            this.decompose(struct.fields, name);
            decompNames.push(name);
            this.log(`Done flattening struct ${name}`);
        });
        this.log(`Total flattened structs: ${decompNames.length}`);

        return decompNames;
    }

    public flattenByName(name: string): void {
        const structs = [
            ...this.findAllStructs(),
            ...this.findAllStructlikeClasses()
        ];
        structs.forEach((elem) => {
            const elemName = elem[0];
            const elemStruct = elem[1];

            if (elemName === name) {
                this.decompose(elemStruct.fields, name);
            }
        });
    }

    public flattenStruct(struct: Struct): void {
        const name = this.getStructName(struct);
        this.decompose(struct.fields, name);
    }

    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    private decompose(fields: Field[], name: string): void {
        for (const fun of Query.search(FunctionJp)) {
            this.flattenInFunction(fun, fields, name);
        }
    }

    private flattenInFunction(fun: FunctionJp, fields: Field[], name: string) {
        this.log("----------------------------------------------------------------------");
        this.log(`Flattening struct ${name} in function ${fun.name}`);
        let changes = 0;
        changes += this.flattenParams(fun, fields, name);
        changes += this.flattenRefs(fun, fields, name);
        // changes += this.flattenDecls(fun, fields, name);
        // changes += this.flattenAssignments(fun, fields, name);
        // changes += this.flattenReturns(fun, fields, name);
        // changes += this.flattenCalls(fun, fields, name);

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

    private flattenRefs(fun: FunctionJp, fields: Field[], name: string): number {
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