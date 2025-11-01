import { BinaryOp, Call, Expression, FloatLiteral, FunctionJp, IntLiteral, Literal, ParenExpr, ReturnStmt, Statement, Type, UnaryOp, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import IdGenerator from "@specs-feup/lara/api/lara/util/IdGenerator.js";
import NormalizeToSubset from "@specs-feup/clava/api/clava/opt/NormalizeToSubset.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

export class Inliner extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("Inliner", silent);
    }

    public inline(call: Call, prefix: string = "_i"): boolean {
        if (!this.canInline(call)) {
            return false;
        }
        this.log(`Inlining call to function ${call.function.name}.`);

        const id = IdGenerator.next(prefix);
        const fun = call.function;
        const clone = fun.clone(id);
        const normOk = this.ensureNormalization(clone);
        if (!normOk) {
            this.logError(`Failed to normalize function ${fun.name} for inlining.`);
            return false;
        }

        const transStmts = this.transformStatements(clone, call, id);

        const inlineBegin = ClavaJoinPoints.stmtLiteral(`//${fun.name}(): begin inline`);
        const inlineEnd = ClavaJoinPoints.stmtLiteral(`//${fun.name}(): end inline`);

        const callStmt = call.getAncestor("statement") as Statement;

        // bizarre insertion order, because the begin/end comments weren't being processed correctly
        // when we do this in the sane way (i.e., callStmt.insertBefore)
        callStmt.insertAfter(inlineBegin);
        inlineBegin.insertAfter(inlineEnd);
        for (const stmt of transStmts.reverse()) {
            inlineBegin.insertAfter(stmt);
        }

        callStmt.detach();
        this.detachClonedFunction(clone);

        for (const stmt of transStmts) {
            this.santitizeStatement(stmt);
        }

        this.log(`Successfully inlined function ${fun.name}.`);
        return true;
    }

    public canInline(call: Call): boolean {
        if (call == null) {
            this.logError("Call joinpoint is null.");
            return false;
        }
        if (!(call.function instanceof FunctionJp)) {
            this.logError(`Call at ${call.location} has no associated function implementation.`);
            return false;
        }
        const retType = call.function.returnType;
        const isVoidReturn = retType.code.includes("void");
        const isImpl = call.function.isImplementation;

        if (!isImpl) {
            this.logError(`Function ${call.function.name} called at ${call.location} has no implementation.`);
        }
        if (!isVoidReturn) {
            this.logError(`Function ${call.function.name} called at ${call.location} is not void`);
        }
        return isVoidReturn && isImpl;
    }

    protected ensureNormalization(jp: Call | FunctionJp): boolean {
        const actionPoint = (jp instanceof Call) ? jp.getAncestor("statement") as Statement : jp;
        try {
            NormalizeToSubset(actionPoint, { simplifyLoops: { forToWhile: false } });
            return true;
        } catch (e) {
            if (jp instanceof Call) {
                this.logWarning(`Failed to normalize call at ${actionPoint.location}`);
            }
            if (jp instanceof FunctionJp) {
                this.logWarning(`Failed to normalize function ${jp.name}`);
            }
            return false;
        }
    }

    protected transformStatements(fun: FunctionJp, call: Call, id: string): Statement[] {
        const transformedStmts: Statement[] = [];

        const argToParamMap = new Map<string, Expression>();
        for (let i = 0; i < call.args.length; i++) {
            const arg = call.args[i];
            const param = fun.params[i];
            argToParamMap.set(param.name, arg);
        }

        let useEndLabel = false;
        const endLabel = ClavaJoinPoints.labelDecl(`end_inline${id}`);

        const stmts = fun.body.stmts;
        for (const stmt of stmts) {
            // ignore top-level return statements
            if (stmt instanceof ReturnStmt) {
                continue;
            }
            // change varrefs under stmt tree to either arg expressions or renamed variables
            for (const varref of Query.searchFrom(stmt, Varref).get()) {
                if (argToParamMap.has(varref.name)) {
                    const argExpr = argToParamMap.get(varref.name) as Expression;
                    const newVarref = !(argExpr instanceof Varref) ?
                        ClavaJoinPoints.parenthesis(argExpr.deepCopy() as Expression) :
                        argExpr.deepCopy();
                    varref.replaceWith(newVarref);
                }
                else if (varref.isFunctionCall || (varref.decl as Vardecl).isGlobal) {
                    continue;
                }
                else {
                    const newName = `${varref.name}${id}`;
                    varref.setName(newName);
                }
            }
            // rename all vardecls under stmt tree
            for (const vardecl of Query.searchFrom(stmt, Vardecl).get()) {
                const newName = `${vardecl.name}${id}`;
                vardecl.setName(newName);
            }
            // replace non-top level return statements with goto end label
            for (const retStmt of Query.searchFrom(stmt, ReturnStmt).get()) {
                const gotoStmt = ClavaJoinPoints.gotoStmt(endLabel)
                retStmt.replaceWith(gotoStmt);
                useEndLabel = true;
            }
            transformedStmts.push(stmt);
            stmt.detach();
        }

        if (useEndLabel) {
            const endLabelStmt = ClavaJoinPoints.labelStmt(endLabel);
            const emptyStmt = ClavaJoinPoints.stmtLiteral(";");
            transformedStmts.push(endLabelStmt);
            transformedStmts.push(emptyStmt); // to make code compliant pre-C23
        }
        return transformedStmts;
    }

    protected detachClonedFunction(fun: FunctionJp): void {
        for (const f of Query.search(FunctionJp, { name: fun.name }).get()) {
            f.detach();
        }
    }

    public santitizeStatement(stmt: Statement): void {
        // param turned into literal because arg was literal
        // may result in things like &123 in funtion calls
        for (const op of Query.searchFrom(stmt, UnaryOp, { operator: "&" }).get()) {
            const child = op.children[0];
            if (child instanceof Literal) {
                const parentStmt = op.getAncestor("statement") as Statement;
                const newVarName = IdGenerator.next("_lit");

                const newVardecl = ClavaJoinPoints.varDecl(newVarName, child.copy());
                parentStmt.insertBefore(newVardecl);

                const newVarref = newVardecl.varref();
                op.setFirstChild(newVarref);
            }
        }
        // the classic addr-of operator followed by deref, i.e, *(&var)
        for (const derefOp of Query.searchFrom(stmt, UnaryOp, { operator: "*" }).get()) {
            const child = (derefOp.children[0] instanceof ParenExpr) ?
                derefOp.children[0].children[0] :
                derefOp.children[0];

            if (child instanceof UnaryOp && child.operator == "&") {
                const grandChild = child.children[0];
                derefOp.replaceWith(grandChild);
            }
        }
        // remove redundant parenthesis
        let changed = true;
        while (changed) {
            changed = false;
            for (const parenExpr of Query.searchFromInclusive(stmt, ParenExpr, (p) => !(p.parent instanceof ParenExpr) && p.children.length == 1).get()) {

                const child = parenExpr.children[0];
                if ((child instanceof Varref) || (child instanceof Literal)) {
                    parenExpr.replaceWith(child);
                    changed = true;
                }
                if (child instanceof ParenExpr) {
                    parenExpr.replaceWith(child);
                    changed = true;
                }
            }
        }
    }
}