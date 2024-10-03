import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints";
import ClavaType from "@specs-feup/clava/api/clava/ClavaType";
import { ArrayAccess, Call, Expression, FunctionJp, Param, ReturnStmt, UnaryOp, Varref } from "@specs-feup/clava/api/Joinpoints";
import Query from "@specs-feup/lara/api/weaver/Query";
import IdGenerator from "@specs-feup/lara/api/lara/util/IdGenerator";

export class Voidifier {
    constructor() { }

    voidify(fun: FunctionJp, returnVarName = "rtr_value"): boolean {
        const returnStmts = this.#findNonvoidReturnStmts(fun);
        if (returnStmts.length == 0) {
            return false;
        }
        if (this.#functionIsOperator(fun)) {
            return false;
        }
        this.#makeDefaultParamsExplicit(fun);

        const retVarType = fun.returnType;

        this.#voidifyFunction(fun, returnStmts, returnVarName, retVarType);

        for (const call of Query.search(Call, { "signature": fun.signature })) {
            this.#handleCall(call, fun, retVarType);
        }
        return true;
    }

    #makeDefaultParamsExplicit(fun: FunctionJp): void {
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

        // Update calls with the actual values
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

    #functionIsOperator(fun) {
        // Honestly I have no idea how to do this using the current AST
        // So we can use a regex, since they always follow the pattern of
        // "operator<symbol>"
        const regex = /operator[^\w\s]+/;

        return regex.test(fun.name);
    }

    #handleAssignmentCall(call, fun) {
        const parent = call.parent;
        let newArg: UnaryOp;

        if (parent.left instanceof Varref) {
            const newRef = ClavaJoinPoints.varRef(parent.left.declaration);
            newArg = ClavaJoinPoints.unaryOp("&", newRef);
        }
        else if (parent.left instanceof ArrayAccess) {
            newArg = ClavaJoinPoints.unaryOp("&", parent.left);
        }
        else if (parent.left instanceof UnaryOp && parent.left.kind == "deref") {
            newArg = parent.left.children[0];
        }
        else {
            throw new Error("[Voidifier] Unexpected lhs of call: " + parent.left.joinPointType + "\nOn source code line: " + parent.parent.code);
        }
        // the pointer may need to be casted if there are signed/unsigned mismatches
        const newCastedArg = this.#applyCasting(newArg, fun);

        const newCall = this.#buildCall(fun, call, newCastedArg);
        parent.replaceWith(newCall);
    }

    #handleIsolatedCall(call, fun, retVarType) {
        const tempId = IdGenerator.next("__vdtemp");
        const tempVar = ClavaJoinPoints.varDeclNoInit(tempId, retVarType);

        // for things like "while(foo(&__dummy))"
        if (call.parent.parent.instanceOf("loop")) {
            call.parent.parent.insertBefore(tempVar);
        }
        else {
            call.insertBefore(tempVar);
        }

        const newRef = ClavaJoinPoints.varRef(tempVar);
        const newArg = ClavaJoinPoints.unaryOp("&", newRef);

        const newCall = this.#buildCall(fun, call, newArg);
        call.replaceWith(newCall);
    }

    #handleGenericCall(call, fun, retVarType) {
        const masterStmt = this.#findParentStmt(call);

        // create new temp variable
        const tempId = IdGenerator.next("__temp");
        const tempVar = ClavaJoinPoints.varDeclNoInit(tempId, retVarType);
        masterStmt.insertBefore(tempVar);

        // build argument with temp variable
        const newRef = ClavaJoinPoints.varRef(tempVar);
        const newArg = ClavaJoinPoints.unaryOp("&", newRef);

        // create new function call, and add it before the original stmt
        const newCall = this.#buildCall(fun, call, newArg);
        masterStmt.insertBefore(newCall);

        // change call in original stmt to use temp variable
        call.replaceWith(ClavaJoinPoints.varRef(tempVar));
    }

    #buildCall(fun, oldCall, newArg) {
        newArg = Array.isArray(newArg) ? newArg : [newArg];
        const args = [...oldCall.argList, ...newArg];

        const newCall = ClavaJoinPoints.call(fun, ...args);
        return newCall;
    }

    #applyCasting(arg, fun) {
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

    #findParentStmt(call) {
        let parent = call.parent;
        while (!parent.instanceOf("statement")) {
            parent = parent.parent;
        }
        if (parent.parent.instanceOf(["loop", "if"])) { // maybe even switch
            parent = parent.parent;
        }
        return parent;
    }

    #handleCall(call, fun, retVarType) {
        const parent = call.parent;

        // call is in an assignment
        if (parent.instanceOf("binaryOp") && parent.kind == "assign") {
            this.#handleAssignmentCall(call, fun);
        }
        // call is isolated (i.e., the return value is ignored. We still need to pass a valid variable to save it, though)
        else if (parent.instanceOf("exprStmt")) {
            this.#handleIsolatedCall(call, fun, retVarType);
        }
        // call is in the middle of some expression
        else {
            this.#handleGenericCall(call, fun, retVarType);
        }
    }

    #voidifyFunction(fun, returnStmts, returnVarName, retVarType): void {
        const pointerType = ClavaJoinPoints.pointer(retVarType);
        const retParam = ClavaJoinPoints.param(returnVarName, pointerType);
        fun.addParam(retParam);

        for (const ret of returnStmts) {
            const derefRet = ClavaJoinPoints.unaryOp("*", retParam.varref());
            const retVal = ret.children[0];
            retVal.detach();
            const op = ClavaJoinPoints.binaryOp("=", derefRet, retVal, retVarType);
            ret.insertBefore(ClavaJoinPoints.exprStmt(op));

        }
        fun.setReturnType(ClavaType.asType("void"));
    }

    #findNonvoidReturnStmts(fun: FunctionJp): ReturnStmt[] {
        const returnStmts: ReturnStmt[] = [];
        for (const ret of Query.searchFrom(fun, ReturnStmt)) {
            if (ret.numChildren > 0) {
                returnStmts.push(ret);
            }
        }
        return returnStmts;
    }
}