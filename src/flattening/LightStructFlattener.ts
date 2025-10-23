import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js"
import { ArrayAccess, ArrayType, BinaryOp, Call, Cast, DeclStmt, Expression, ExprStmt, Field, FunctionJp, IncompleteArrayType, IntLiteral, MemberAccess, Param, ParenExpr, Statement, Type, UnaryOp, Vardecl, VariableArrayType, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { StructFlatteningAlgorithm } from "./StructFlatteningAlgorithm.js";
import { Voidifier } from "../function/Voidifier.js";
import IdGenerator from "@specs-feup/lara/api/lara/util/IdGenerator.js";
import { VisualizationTool } from "@specs-feup/clava-visualization/api/VisualizationTool.js";

export class LightStructFlattener extends StructFlatteningAlgorithm {
    constructor(silent: boolean = false) {
        super("StructFlattener", silent);
        this.setSilent(true);
    }

    public flatten(fields: Field[], name: string, functions: FunctionJp[]): void {
        let nChanges = 0;

        functions.forEach((fun) => {
            nChanges += this.flattenInFunction(fun, fields, name);
        });
        nChanges += this.flattenGlobals(fields, name);

        const topFunction = functions[0];
        if (topFunction) {
            this.buildTopFunctionInterface(name, topFunction, fields);
        }
        this.log(`Total occurrences of struct ${name} flattened: ${nChanges}`);
    }

    // -----------------------------------------------------------------------
    private flattenGlobals(fields: Field[], name: string): number {
        let changes = 0;
        this.log("----------------------------------------------------------------------");
        this.log(`Flattening struct ${name} in global scope`);

        for (const decl of Query.search(Vardecl, (d) => d.type.code.includes(name) && d.isGlobal)) {
            const newDecls = this.flattenDecl(decl, fields);
            const parent = decl.getAncestor("statement") as DeclStmt;
            newDecls.forEach((newDecl) => {
                parent.insertBefore(newDecl);
            });
            //parent.detach();

            this.log(`  Flattened global decl ${decl.name}`);
        }
        if (changes === 0) {
            this.log(`No occurrences of struct ${name} found in global scope`);
        } else {
            this.log(`Flattened all ${changes} occurrences of struct ${name} in global scope`);
        }
        return changes;
    }

    private flattenInFunction(fun: FunctionJp, fields: Field[], name: string): number {
        this.log("----------------------------------------------------------------------");
        this.log(`Flattening struct ${name} in function ${fun.name}`);
        let changes = 0;
        changes += this.flattenParams(fun, fields, name);
        changes += this.flattenMemberRefs(fun, fields, name);
        changes += this.flattenNullComparison(fun, fields, name);
        changes += this.flattenDecls(fun, fields, name);
        changes += this.flattenAssignments(fun, fields, name);
        changes += this.flattenCalls(fun, fields, name);

        if (changes > 0) {
            this.log(`Flattened all ${changes} occurrences of struct ${name} in function ${fun.name}`);
        } else {
            this.log(`No occurrences of struct ${name} found in function ${fun.name}`);
        }
        return changes;
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

        const newParams: Param[] = [];
        fields.forEach((field) => {
            const newParamName = `${param.name}_${field.name}`;
            let indirection = this.getLevelOfIndirection(type);

            let newType = this.getBaseType(field.type);
            while (indirection > 0) {
                newType = ClavaJoinPoints.pointer(newType);
                indirection--;
            }

            const newParam = ClavaJoinPoints.param(newParamName, newType);
            newParams.push(newParam);
        });
        return newParams;
    }

    private flattenMemberRefs(fun: FunctionJp, fields: Field[], name: string): number {
        let changes = 0;

        for (const ref of Query.searchFrom(fun, Varref)) {
            const type = ref.type;
            if (type.code.includes(name)) {
                const isSimpleMemberAccess = ref.parent instanceof MemberAccess;
                const isDerefMemberAccess = (ref.parent instanceof UnaryOp) &&
                    ((ref.parent.parent instanceof MemberAccess) || (ref.parent.parent instanceof ParenExpr && ref.parent.parent.parent instanceof MemberAccess));

                if (isSimpleMemberAccess || isDerefMemberAccess) {
                    changes += this.flattenSimpleMemberAccess(ref, fields, changes);
                    continue;
                }

                const isArrayAccess = (ref.parent instanceof ArrayAccess) && (ref.parent.parent instanceof MemberAccess);
                if (isArrayAccess) {
                    changes += this.flattenArrayMemberAccess(ref, fields, changes);
                    continue;
                }
            }
        }
        return changes;
    }

    private flattenSimpleMemberAccess(ref: Varref, fields: Field[], changes: number) {
        let member: MemberAccess;
        let isDeref = false;
        let isAddrOf = false;

        // foo->bar
        if (ref.parent instanceof MemberAccess) {
            member = ref.parent;
        }
        // (*foo)->bar or (&foo)->bar
        if (ref.parent instanceof UnaryOp) {
            if (ref.parent.parent instanceof MemberAccess) {
                member = ref.parent.parent;
            }
            if (ref.parent.parent instanceof ParenExpr && ref.parent.parent.parent instanceof MemberAccess) {
                member = ref.parent.parent.parent;
            }
            isDeref = ref.parent.operator === "*";
            isAddrOf = ref.parent.operator === "&";
        }

        if (member! instanceof MemberAccess) {
            const fieldName = member.name;
            const baseVarrefName = `${ref.name}_${fieldName}`;
            const newVarrefName = isDeref ? `(*${baseVarrefName})` : (isAddrOf ? `(&${baseVarrefName})` : baseVarrefName);
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
            this.log(`  Flattened member ref ${ref.name}${member.arrow ? "->" : "."}${fieldName}`);
        }
        return changes;
    }

    private flattenArrayMemberAccess(ref: Varref, fields: Field[], changes: number): number {
        console.log(ref);
        const arrayAccess = ref.parent as ArrayAccess;
        const memberAccess = arrayAccess.parent as MemberAccess;
        const indexExprs = arrayAccess.children.splice(1);
        const hasTopExpr = memberAccess.parent instanceof ArrayAccess;
        if (hasTopExpr) {
            indexExprs.push(memberAccess.parent.children[1]);
        }

        const fieldName = memberAccess.name!;
        const field = fields.find((f) => f.name === fieldName)!;
        const baseVarrefName = `${ref.name}_${fieldName}`;
        let newVarref = `${baseVarrefName}${indexExprs.map((expr) => `[${expr.code}]`).join("")}`;
        if (memberAccess.arrow && !field.type.isArray) {
            newVarref = `(*${newVarref})`;
        }
        const newVarrefJp = ClavaJoinPoints.exprLiteral(newVarref);
        if (!hasTopExpr) {
            memberAccess.replaceWith(newVarrefJp);
        }
        else {
            memberAccess.parent.replaceWith(newVarrefJp);
        }
        return 1;
    }

    private flattenNullComparison(fun: FunctionJp, fields: Field[], name: string): number {
        let changes = 0;

        for (const ref of Query.searchFrom(fun, Varref)) {
            const type = ref.type;
            if (!type.code.includes(name)) {
                continue;
            }

            // foo = bar != nullptr
            if (ref.parent instanceof BinaryOp && (ref.parent.operator == "!=" || ref.parent.operator == "==")) {
                const newRef = ClavaJoinPoints.exprLiteral(`${ref.name}_${fields[0].name}`);
                ref.replaceWith(newRef);
                changes++;
                this.log(`  Flattened struct ref ${ref.name} in null comparison`);
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

    private flattenAssignments(fun: FunctionJp, fields: Field[], name: string): number {
        let changes = 0;

        const refs = Query.searchFrom(fun, Varref).get();
        for (const ref of refs) {
            if (ref.parent == null || ref.getAncestor("body") == null) {
                continue;
            }

            const type = ref.type;
            if (!type.code.includes(name)) {
                continue;
            }

            const stmt = ref.getAncestor("statement") as Statement;
            const assign = (stmt.children[0] instanceof BinaryOp) ? stmt.children[0] as BinaryOp : null;
            if (assign != null && assign.operator == "=") {
                const rhs = assign.children[1] as Expression;
                const lhs = assign.children[0] as Expression;
                if (rhs == null) {
                    this.logWarning(`  Could not flatten assignment "${stmt.code}" in function ${fun.name} (missing rhs)`);
                    continue;
                }
                if (lhs == null) {
                    this.logWarning(`  Could not flatten assignment "${stmt.code}" in function ${fun.name} (missing lhs)`);
                    continue;
                }

                const hasMalloc = Query.searchFromInclusive(rhs, Call, { name: "malloc" }).get().length > 0;
                const lhsHasRef = Query.searchFromInclusive(lhs, Varref).get().some((l) => l.type != null ? l.type.code.includes(name) : false);
                const rhsHasRef = Query.searchFromInclusive(rhs, Varref).get().some((r) => r.type != null ? r.type.code.includes(name) : false);
                const hasNullptr = rhs.code.replace(" ", "").includes("(void*) 0") || rhs.code.replace(" ", "").includes("NULL");

                if (hasMalloc && lhsHasRef) {
                    this.flattenMallocAssignment(assign, fields, name);
                }
                else if (lhsHasRef && rhsHasRef) {
                    this.flattenStructPointerAssignment(assign, fields, name);
                }

                else if (lhsHasRef && !rhsHasRef && hasNullptr) {
                    this.flattenNullToStructAssignment(lhs, stmt, fields, name);
                }
                else {
                    this.logWarning(`  Could not flatten assignment "${assign.code}" in function ${fun.name}`);
                    this.logWarning(`    LHS: ${lhs.code}, RHS: ${rhs.code}, hasMalloc: ${hasMalloc}, lhsHasRef: ${lhsHasRef}, rhsHasRef: ${rhsHasRef}, hasNullptr: ${hasNullptr}`);
                    continue;
                }
                changes++;
                this.log(`  Flattened struct pointer assignment involving ${ref.name}`);
            }
        }
        return changes;
    }

    private flattenMallocAssignment(assign: BinaryOp, fields: Field[], name: string): void {
        const parentStmt = assign.getAncestor("statement") as Statement;
        const lhs = assign.left;
        const rhs = assign.right;
        const malloc = Query.searchFromInclusive(rhs, Call, { name: "malloc" }).first()!;

        const sizeExpr = malloc.args[0];
        const sizeVarName = IdGenerator.next("malloc_size");
        const sizeVar = ClavaJoinPoints.varDecl(sizeVarName, sizeExpr);
        sizeVar.setType(ClavaJoinPoints.type("size_t"));
        const sizeDeclStmt = ClavaJoinPoints.declStmt(sizeVar);
        parentStmt.insertBefore(sizeDeclStmt);

        for (const field of fields) {
            const newLhsName = `${lhs.code}_${field.name}`;
            const baseType = this.getBaseType(field.type);
            // should always be pointer anyway, as the original assigns to a struct pointer
            const newLhsType = lhs.type.isPointer ? ClavaJoinPoints.pointer(baseType) : baseType;
            const newLhs = ClavaJoinPoints.exprLiteral(newLhsName);
            newLhs.setType(newLhsType);

            let fieldSizeExpr: Expression;
            if (field.type.isArray) {
                const sizes = [sizeVarName];
                for (const otherField of fields) {
                    if (otherField.name === field.name) {
                        break;
                    }
                    sizes.push(`sizeof(${this.getBaseType(otherField.type).code})`);
                }
                if (sizes.length > 1) {
                    fieldSizeExpr = ClavaJoinPoints.exprLiteral(sizes.join(" - "));
                }
                else {
                    fieldSizeExpr = ClavaJoinPoints.exprLiteral(sizes[0]);
                }
            }
            else {
                fieldSizeExpr = ClavaJoinPoints.exprLiteral(`sizeof(${baseType.code})`);
            }

            const newMalloc = ClavaJoinPoints.callFromName("malloc", ClavaJoinPoints.pointer(baseType), fieldSizeExpr);
            const newAssign = ClavaJoinPoints.binaryOp("=", newLhs, newMalloc);

            parentStmt.insertBefore(ClavaJoinPoints.exprStmt(newAssign));
        }
        parentStmt.detach();
    }

    private flattenStructPointerAssignment(assign: BinaryOp, fields: Field[], name: string): void {
        const lhs = assign.left;
        const rhs = assign.right;
        const parentStmt = assign.getAncestor("statement") as Statement;

        const lhsVar = Query.searchFromInclusive(lhs, Varref).first()!;
        const rhsVar = Query.searchFromInclusive(rhs, Varref).first()!;

        for (const field of fields) {
            const newLhsName = `${lhsVar.name}_${field.name}`;
            let newLhs = ClavaJoinPoints.exprLiteral(newLhsName);
            if (lhsVar.parent instanceof UnaryOp && lhsVar.parent.operator === "*") {
                newLhs = ClavaJoinPoints.exprLiteral(`*${newLhsName}`);
            }

            const newRhsName = `${rhsVar.name}_${field.name}`;
            let newRhs = ClavaJoinPoints.exprLiteral(newRhsName);
            if (rhsVar.parent instanceof UnaryOp && rhsVar.parent.operator === "*") {
                newRhs = ClavaJoinPoints.exprLiteral(`*${newRhsName}`);
            }

            const newAssign = ClavaJoinPoints.binaryOp("=", newLhs, newRhs);
            parentStmt.insertBefore(ClavaJoinPoints.exprStmt(newAssign));
        }
        parentStmt.detach();
    }

    private flattenNullToStructAssignment(lhs: Expression, parentStmt: Statement, fields: Field[], name: string): void {
        // supports foo = NULL, *foo = NULL, &foo = NULL, where foo is a struct pointer
        for (const field of fields) {
            const baseLhsName = Query.searchFromInclusive(lhs, Varref).first()!.name;
            const newLhsName = `${baseLhsName}_${field.name}`;

            let newLhs = ClavaJoinPoints.exprLiteral(newLhsName);
            if (lhs instanceof UnaryOp && lhs.operator === "*") {
                newLhs = ClavaJoinPoints.exprLiteral(`*${newLhsName}`);
            }
            if (lhs instanceof UnaryOp && lhs.operator === "&") {
                newLhs = ClavaJoinPoints.exprLiteral(`&${newLhsName}`);
            }

            const nullExpr = ClavaJoinPoints.exprLiteral("((void *) 0)");
            const newAssign = ClavaJoinPoints.binaryOp("=", newLhs, nullExpr);
            parentStmt.insertBefore(ClavaJoinPoints.exprStmt(newAssign));
        }
        parentStmt.detach();
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

        // this only works because we know we only have expr that are at most (*argName) or (&argName)
        if (!arg.code.includes("[") && !arg.code.includes("]")) {
            let [prefix, argName, suffix] = ["", arg.code, ""];

            if (arg.code.includes("(")) {
                const openIdx = arg.code.indexOf("(");
                const closeIdx = arg.code.lastIndexOf(")");
                prefix = arg.code.substring(0, openIdx);
                argName = arg.code.substring(openIdx + 1, closeIdx);
                suffix = arg.code.substring(closeIdx);
            }
            fields.forEach((field) => {
                const newArgName = `${prefix}${argName}_${field.name}`;
                const newArg = ClavaJoinPoints.exprLiteral(newArgName);
                newArgs.push(newArg);
            });
        }
        else {
            const arrayAccess = Query.searchFromInclusive(arg, ArrayAccess).first()!;
            const indexExprs = arrayAccess.children.splice(1);
            const varref = arrayAccess.children[0] as Varref;
            const baseVarName = varref.name;
            const deref = (arrayAccess.parent instanceof UnaryOp) && arrayAccess.parent.operator === "*";
            const addrOf = (arrayAccess.parent instanceof UnaryOp) && arrayAccess.parent.operator === "&";

            fields.forEach((field) => {
                let newArgName = `${baseVarName}_${field.name}${indexExprs.map((expr) => `[${expr.code}]`).join("")}`;
                if (deref) {
                    newArgName = `(*${newArgName})`;
                }
                if (addrOf) {
                    newArgName = `(&${newArgName})`;
                }
                const newArg = ClavaJoinPoints.exprLiteral(newArgName);
                newArgs.push(newArg);
            });
        }
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

                    let init: Expression;
                    if (arg.type.isPointer) {
                        if (field.type.isArray) {
                            init = ClavaJoinPoints.exprLiteral(`${strippedArgName}->${field.name}`);
                        }
                        else {
                            init = ClavaJoinPoints.exprLiteral(`&(${strippedArgName}->${field.name})`);
                        }
                    }
                    else {
                        init = ClavaJoinPoints.exprLiteral(`${strippedArgName}.${field.name}`);
                    }
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

    private getLevelOfIndirection(type: Type): number {
        let level = 0;
        let typeStr = type.code;

        while (typeStr.includes("*")) {
            level++;
            typeStr = typeStr.replace("*", "").trim();
        }
        return level;
    }

    private fieldIsArray(member: MemberAccess, fields: Field[]): boolean {
        const field = fields.find((f) => f.name === member.name);
        if (field) {
            return field.type.code.includes("[]") || field.type instanceof ArrayType || field.type instanceof IncompleteArrayType || field.type instanceof VariableArrayType;
        }
        return false;
    }
}