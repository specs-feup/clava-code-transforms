import { Call, Expression, FunctionJp, ReturnStmt, Statement, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js";
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
            this.logError(`Call to function ${call.function.name} is not inlinable.`);
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
        clone.detach();

        this.log(`Successfully inlined function ${fun.name}.`);
        return true;
    }

    public canInline(call: Call): boolean {
        const retType = call.function.returnType;
        const isVoidReturn = retType.code.includes("void");
        const isImpl = call.function.isImplementation;

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
                    varref.replaceWith(argExpr.deepCopy());
                }
                else if (varref.isFunctionCall) {
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
                ClavaJoinPoints.gotoStmt(endLabel)
                retStmt.replaceWith(endLabel);
                useEndLabel = true;
            }
            transformedStmts.push(stmt);
            stmt.detach();
        }

        if (useEndLabel) {
            const labelStmt = ClavaJoinPoints.labelStmt(endLabel);
            transformedStmts.push(labelStmt);
        }
        return transformedStmts;
    }
}