import { Call, FunctionJp, Statement } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import IdGenerator from "@specs-feup/lara/api/lara/util/IdGenerator.js";
import NormalizeToSubset from "@specs-feup/clava/api/clava/opt/NormalizeToSubset.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";

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

        const stmts = clone.body.stmts;
        const transStmts = this.transformStatements(stmts, call, id);

        const inlineBegin = ClavaJoinPoints.comment(`${fun.name}(): begin inline`);
        const inlineEnd = ClavaJoinPoints.comment(`${fun.name}(): end inline`);

        const callStmt = call.getAncestor("statement") as Statement;
        callStmt.insertBefore(inlineBegin);
        transStmts.forEach((stmt) => {
            callStmt.insertBefore(stmt);
        });
        callStmt.insertBefore(inlineEnd);

        callStmt.detach();

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
            NormalizeToSubset(actionPoint);
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

    protected transformStatements(stmts: Statement[], call: Call, id: string): Statement[] {
        const transformedStmts: Statement[] = [];


        return transformedStmts;
    }
}