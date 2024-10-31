import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { ArrayAccess, BinaryOp, Call, Expression, ExprStmt, FunctionJp, If, Loop, Param, ParenExpr, ReturnStmt, Statement, Type, UnaryOp, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import IdGenerator from "@specs-feup/lara/api/lara/util/IdGenerator.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

export class Voidifier {
    constructor() { }

    public voidify(fun: FunctionJp, returnVarName = "rtr_value"): boolean {
        const returnStmts = this.findNonvoidReturnStmts(fun);
        if (returnStmts.length == 0) {
            return false;
        }
        if (this.functionIsOperator(fun)) {
            return false;
        }
        this.makeDefaultParamsExplicit(fun);

        const retVarType = fun.returnType;

        this.voidifyFunction(fun, returnStmts, returnVarName, retVarType);

        for (const call of Query.search(Call, { "signature": fun.signature })) {
            this.handleCall(call, fun, retVarType);
        }
        return true;
    }

    private makeDefaultParamsExplicit(fun: FunctionJp): void {
        const initParams: Param[] = [];
        let offset = -1;

        for (const param of fun.params) {
            if (initParams.length == 0) {
                offset++;
            }

            if (param.hasInit) {
                initParams.push(param);
            }
        }
        if (initParams.length == 0) {
            return;
        }

        //Update calls with the actual values

        for (const call of Query.search(Call, { "signature": fun.signature })) {
            const newArgs: Expression[] = [];
            let i = 0;
            let j = 0;

            for (const arg of call.argList) {
                if (i < offset) {
                    newArgs.push(arg);
                }
                else {
                    if (arg instanceof Expression && arg.children.length == 0) {
                        const currParam = initParams[j];
                        const initExpr: Expression = currParam.children[0] as Expression;
                        newArgs.push(initExpr);
                    }
                    else {
                        newArgs.push(arg);
                    }
                    j++;
                }
                i++;
            }
            const newCall = ClavaJoinPoints.call(fun, ...newArgs);
            call.replaceWith(newCall);
        }

        // Remove default values from the function
        for (const param of initParams) {
            param.removeChildren();
        }
    }

    private functionIsOperator(fun: FunctionJp): boolean {
        // Honestly I have no idea how to do this using the current AST
        // So we can use a regex, since they always follow the pattern of
        // "operator<symbol>"
        const regex = /operator[^\w\s]+/;

        return regex.test(fun.name);
    }

    private handleAssignmentCall(call: Call, fun: FunctionJp): void {
        const parent = call.parent as BinaryOp; // TS: should be safe, as it was checked before calling this method
        const lvalue = parent.left;
        const newArg = this.getArgumentFromLhs(lvalue);

        // the pointer may need to be casted if there are signed/unsigned mismatches
        const newCastedArg = this.applyCasting(newArg, fun);

        const newCall = this.buildCall(fun, call, newCastedArg);
        parent.replaceWith(newCall);
    }

    private getArgumentFromLhs(lhs: Expression): Expression {
        let newArg: Expression;

        if (lhs instanceof Varref) {
            const newRef = ClavaJoinPoints.varRef(lhs.vardecl);
            newArg = ClavaJoinPoints.unaryOp("&", newRef);
        }
        else if (lhs instanceof ArrayAccess) {
            newArg = ClavaJoinPoints.unaryOp("&", lhs);
        }
        else if (lhs instanceof ParenExpr) {
            const inner = lhs.subExpr;
            newArg = this.getArgumentFromLhs(inner);
        }
        else if (lhs instanceof UnaryOp && lhs.kind == "deref") {
            newArg = lhs.children[0] as Expression;
        }
        else {
            throw new Error("Unsupported lvalue type");
        }
        return newArg;
    }

    private handleIsolatedCall(call: Call, fun: FunctionJp, retVarType: Type): void {
        const tempId = IdGenerator.next("__vdtemp");
        const tempVar = ClavaJoinPoints.varDeclNoInit(tempId, retVarType);

        // for things like "while(foo(&__dummy))"
        if (call.parent.parent instanceof Loop) {
            call.parent.parent.insertBefore(tempVar);
        }
        else {
            call.insertBefore(tempVar);
        }

        const newRef = ClavaJoinPoints.varRef(tempVar);
        const newArg = ClavaJoinPoints.unaryOp("&", newRef);

        const newCall = this.buildCall(fun, call, newArg);
        call.replaceWith(newCall);
    }

    private handleGenericCall(call: Call, fun: FunctionJp, retVarType: Type): void {
        const masterStmt = this.findParentStmt(call);

        // create new temp variable
        const tempId = IdGenerator.next("__temp");
        const tempVar = ClavaJoinPoints.varDeclNoInit(tempId, retVarType);
        masterStmt.insertBefore(tempVar);

        // build argument with temp variable
        const newRef = ClavaJoinPoints.varRef(tempVar);
        const newArg = ClavaJoinPoints.unaryOp("&", newRef);

        // create new function call, and add it before the original stmt
        const newCall = this.buildCall(fun, call, newArg);
        masterStmt.insertBefore(newCall);

        // change call in original stmt to use temp variable
        call.replaceWith(ClavaJoinPoints.varRef(tempVar));
    }

    private buildCall(fun: FunctionJp, oldCall: Call, ...newArgs: Expression[]): Call {
        const args = [...oldCall.argList, ...newArgs];

        const newCall = ClavaJoinPoints.call(fun, ...args);
        return newCall;
    }

    private applyCasting(arg: Expression, fun: FunctionJp): Expression {
        const lastParam = fun.params[fun.params.length - 1];
        const lastParamType = lastParam.type;
        const argType = arg.type;

        if (lastParamType.code != argType.code) {
            const castedArg = ClavaJoinPoints.cStyleCast(lastParamType, arg);
            return castedArg;
        }
        else {
            return arg;
        }
    }

    private findParentStmt(call: Call): Statement {
        let parent = call.parent;
        while (!(parent instanceof Statement)) {
            parent = parent.parent;
        }
        if (parent.parent instanceof Loop || parent.parent instanceof If) { // maybe even switch
            parent = parent.parent;
        }
        return parent as Statement;
    }

    private handleCall(call: Call, fun: FunctionJp, retVarType: Type): void {
        const parent = call.parent;

        // call is in an assignment
        if (parent instanceof BinaryOp && parent.kind == "assign") {
            this.handleAssignmentCall(call, fun);
        }
        // call is isolated (i.e., the return value is ignored. We still need to pass a valid variable to save it, though)
        else if (parent instanceof ExprStmt) {
            this.handleIsolatedCall(call, fun, retVarType);
        }
        // call is in the middle of some expression
        else {
            this.handleGenericCall(call, fun, retVarType);
        }
    }

    private voidifyFunction(fun: FunctionJp, returnStmts: ReturnStmt[], returnVarName: string, retVarType: Type): void {
        const pointerType = ClavaJoinPoints.pointer(retVarType);
        const retParam = ClavaJoinPoints.param(returnVarName, pointerType);
        fun.addParam(retParam.name, retParam.type);


        for (const ret of returnStmts) {
            const derefRet = ClavaJoinPoints.unaryOp("*", retParam.varref());
            const retVal = ret.children[0] as Expression;   // TS: possibly dangerous, needs to be checked
            retVal.detach();
            const op = ClavaJoinPoints.binaryOp("=", derefRet, retVal, retVarType);
            ret.insertBefore(ClavaJoinPoints.exprStmt(op));

        }
        const voidType = ClavaJoinPoints.type("void");
        fun.setReturnType(voidType);
    }

    private findNonvoidReturnStmts(fun: FunctionJp): ReturnStmt[] {
        const returnStmts: ReturnStmt[] = [];
        for (const ret of Query.searchFrom(fun, ReturnStmt)) {
            if (ret.numChildren > 0) {
                returnStmts.push(ret);
            }
        }
        return returnStmts;
    }
}