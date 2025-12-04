import { BinaryOp, Call, DeclStmt, Expression, FloatLiteral, FunctionJp, IntLiteral, Literal, Param, ParenExpr, ReturnStmt, Scope, Statement, Type, UnaryOp, Vardecl, VariableArrayType, Varref } from "@specs-feup/clava/api/Joinpoints.js";
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
            if (jp instanceof FunctionJp) {
                // NormalizeToSubset creates decomp_0, decomp_1,... variables regardless of whether they already exist
                // so we need to rename them first to avoid conflicts
                this.renameDecompVars(jp);
            }
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

    private renameDecompVars(fun: FunctionJp): void {
        const varsToRename: Vardecl[] = [];
        for (const vardecl of Query.searchFrom(fun, Vardecl).get()) {
            const split = vardecl.name.split("_");
            if (split.length == 2 && split[0] == "decomp" && !isNaN(Number(split[1]))) {
                varsToRename.push(vardecl);
            }
        }
        for (const vardecl of varsToRename) {
            const baseName = `${vardecl.name}_renamed_`;
            const newName = IdGenerator.next(baseName);

            for (const varref of Query.searchFrom(fun, Varref, { name: vardecl.name }).get()) {
                varref.setName(newName);
            }
            vardecl.setName(newName);
        }
    }

    private isNeverReassigned(param: Param, fun: FunctionJp): boolean {
        for (const varref of Query.searchFrom(fun.body, Varref, { name: param.name }).get()) {
            const binaryOp = varref.getAncestor("binaryOp") as BinaryOp;
            if (binaryOp == null || binaryOp.operator != "=") {
                continue;
            }
            if (binaryOp.left.code == param.name) {
                return false;
            }
        }
        return true;
    }

    protected transformStatements(fun: FunctionJp, call: Call, id: string): Statement[] {
        const transformedStmts: Statement[] = [];

        const argToParamMap = new Map<string, Expression>();
        for (let i = 0; i < call.args.length; i++) {
            const arg = call.args[i];
            const param = fun.params[i];

            if (this.isNeverReassigned(param, fun)) {
                argToParamMap.set(param.name, arg);
            }
            else {
                const newVarName = `${param.name}_local_${id}`;
                const newVardecl = ClavaJoinPoints.varDecl(newVarName, arg.copy());
                const declStmt = ClavaJoinPoints.declStmt(newVardecl);
                transformedStmts.push(declStmt);
                const newVarref = newVardecl.varref();
                argToParamMap.set(param.name, newVarref);
                this.log(` Param ${param.name} is reassigned in ${fun.name}; created local copy ${newVarName}.`);
            }
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
            const varrefs = [...Query.searchFrom(stmt, Varref).get(), ...this.getVarrefsInInit(fun, stmt)]
            for (const varref of varrefs) {
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

    private getVarrefsInInit(fun: FunctionJp, stmt: Statement): Varref[] {
        const varrefs: Varref[] = [];
        for (const vardecl of Query.searchFrom(stmt, Vardecl).get()) {
            if (vardecl.type instanceof VariableArrayType) {
                const sizeVarrefs = Query.searchFromInclusive(vardecl.type.sizeExpr!, Varref).get();
                varrefs.push(...sizeVarrefs);
            }
        }
        return varrefs;
    }

    protected detachClonedFunction(fun: FunctionJp): void {
        for (const f of Query.search(FunctionJp, { name: fun.name }).get()) {
            f.detach();
        }
    }

    public santitizeStatement(stmt: Statement): void {
        let changed = true;
        while (changed) {
            changed = false;
            // remove redundant parenthesis
            changed ||= this.removeParenthesis(stmt);

            // param turned into literal because arg was literal
            // may result in things like &123 in function calls
            changed ||= this.convertExprToVars(stmt);

            // the classic addr-of operator followed by deref, i.e, *(&var)
            changed ||= this.simplifyDerefAddrOf(stmt);
        }
    }

    private createTempVarForExpr(expr: Expression, insertionPoint: Statement, prefix: string = "_tmp"): Varref {
        const newVarName = IdGenerator.next(prefix);
        const newVardecl = ClavaJoinPoints.varDecl(newVarName, expr.copy());
        const declStmt = ClavaJoinPoints.declStmt(newVardecl);
        insertionPoint.insertBefore(declStmt);

        const newVarref = newVardecl.varref();
        return newVarref;
    }

    private simplifyDerefAddrOf(stmt: Statement): boolean {
        let changed = false;
        for (const derefOp of Query.searchFrom(stmt, UnaryOp, { operator: "*" }).get()) {
            const child = (derefOp.children[0] instanceof ParenExpr) ?
                derefOp.children[0].children[0] :
                derefOp.children[0];

            if (child instanceof UnaryOp && child.operator == "&") {
                const grandChild = child.children[0];
                derefOp.replaceWith(grandChild);
                changed = true;
            }
        }
        return changed;
    }

    private convertExprToVars(stmt: Statement): boolean {
        let changed = false;
        for (const op of Query.searchFrom(stmt, UnaryOp, (o) => ["&", "*"].includes(o.operator)).get()) {
            let child = op.children[0] as Expression;
            // remove unecessary parenthesis
            while (child instanceof ParenExpr && child.children.length == 1) {
                child = child.children[0] as Expression;
            }
            const insertionPoint = stmt.parent instanceof Scope ? stmt : stmt.parent as Statement;

            if (child instanceof Literal) {
                const newVarref = this.createTempVarForExpr(child, insertionPoint, "_lit");
                child.replaceWith(newVarref);
                changed = true;
            }
            else if ((child instanceof UnaryOp) && ["&", "*"].includes(child.operator)) {
                const grandChild = child.children[0];
                const cancelOut = (op.operator == "&" && child.operator == "*") || (op.operator == "*" && child.operator == "&");
                if (cancelOut) {
                    op.replaceWith(grandChild);
                    changed = true;
                }
                else {
                    const newVarref = this.createTempVarForExpr(child, insertionPoint, "_unop");
                    op.replaceWith(newVarref);
                    changed = true;
                }
            }
            else if (!(child instanceof Varref)) {
                const newVarref = this.createTempVarForExpr(child, insertionPoint, "_expr");
                child.replaceWith(newVarref);
                changed = true;
            }
        }
        return changed;
    }

    private removeParenthesis(stmt: Statement): boolean {
        let changed = false;
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
        for (const lit of Query.searchFrom(stmt, Literal).get()) {
            if (lit.parent instanceof ParenExpr) {
                const parenExpr = lit.parent as ParenExpr;
                parenExpr.replaceWith(lit);
                changed = true;
            }
        }
        return changed;
    }
}