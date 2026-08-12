import { AdvancedTransform } from "../AdvancedTransform.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { BinaryOp, Loop, UnaryOp, Vardecl, Varref, Joinpoint, Literal, Call, Statement, ReturnStmt, GotoStmt, Break, Continue, Expression, ArrayAccess, ParenExpr } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import Queue from 'yocto-queue';

enum VectorReduceSimplificationType {
    COMPLETE,
    PARTIAL
}

type VectorReduceSimplificationInfo = {
    encompassingLoop: Loop,
    encompassingAddSubAssign: BinaryOp,
    removedExpressions: ExprAndPos[],
    sign: number,
    type: VectorReduceSimplificationType
}

enum ExprPos {
    NA,
    LEFT,
    RIGHT
}

type ExprAndPos = {
    expr: Expression,
    pos: ExprPos
}

export class VectorReduceSimplificator extends AdvancedTransform {
    currentModification: number = 0;
    safeToRemoveCache: Map<string, boolean> = new Map();

    constructor(silent: boolean = false) {
        super("VectorReduceSimplificator", silent);
    }

    public simplify(baseJp?: Joinpoint): number {
        baseJp = baseJp ?? Query.root() as Joinpoint;
        const loopsToAnalyze: Loop[] = this.findPossiblySuitableLoops(baseJp);

        const replacements: VectorReduceSimplificationInfo[] = [];

        for (const loop of loopsToAnalyze) {
            if (!(hasRegularControlFlow(loop, this.silent) && hasKnownInitValue(loop) && hasKnownEndValue(loop))) {
                continue;
            }
            for (const opAssign of Query.searchFrom(loop.body, BinaryOp, binop => binop.kind === "add_assign" || binop.kind === "sub_assign")) {
                const firstAncestorLoop: Loop = getFirstAncestorOf(Loop, opAssign)!;
                if (firstAncestorLoop.astId !== loop.astId) continue;

                const firstAncestorAddSubAssign: BinaryOp | undefined = getFirstAncestorOf(BinaryOp, opAssign, binop => binop.kind === "add_assign" || binop.kind === "sub_assign");
                if (firstAncestorAddSubAssign !== undefined) continue;

                const accumVar: Expression = opAssign.left;
                if (!(accumVar instanceof Varref) || accumVar.vardecl === undefined) continue;
                const accessesInsideLoop: Varref[] = Query.searchFrom(loop, Varref, varref => isVarrefOf(varref, accumVar.vardecl)).get();
                if (accessesInsideLoop.length !== 1) continue;

                const finalResultMultiplier = opAssign.kind === "add_assign" ? 1 : -1;

                if (this.canBeSafelyRemovedFromLoop(opAssign.right, loop)) {
                    replacements.push({
                        encompassingLoop: loop,
                        encompassingAddSubAssign: opAssign,
                        sign: finalResultMultiplier,
                        type: VectorReduceSimplificationType.COMPLETE,
                        removedExpressions: [{ expr: opAssign.right, pos: ExprPos.NA }]
                    });
                    continue;
                }

                const toReplace: ExprAndPos[] = [];
                const expressionsToExplore: Queue<ExprAndPos> = new Queue();
                expressionsToExplore.enqueue({ expr: opAssign.right, pos: ExprPos.NA });

                for (const exprAndPos of expressionsToExplore.drain()) {
                    if (!this.canBeSafelyRemovedFromLoop(exprAndPos.expr, loop)) {
                        if (exprAndPos.expr instanceof BinaryOp && exprAndPos.expr.kind === "mul") {
                            expressionsToExplore.enqueue({ expr: exprAndPos.expr.left, pos: ExprPos.LEFT });
                            expressionsToExplore.enqueue({ expr: exprAndPos.expr.right, pos: ExprPos.RIGHT });
                        }
                        else if (exprAndPos.expr instanceof ParenExpr) {
                            expressionsToExplore.enqueue({ expr: exprAndPos.expr.subExpr, pos: ExprPos.NA });
                        }

                        continue;
                    }

                    toReplace.push(exprAndPos);
                }

                if (toReplace.length === 0) {
                    continue;
                }

                replacements.push({
                    encompassingLoop: loop,
                    encompassingAddSubAssign: opAssign,
                    sign: finalResultMultiplier,
                    type: VectorReduceSimplificationType.PARTIAL,
                    removedExpressions: toReplace
                });
            }
        }
        this.safeToRemoveCache = new Map();
        this.applyTransformations(replacements);

        return this.currentModification;
    }

    private applyTransformations(transformations: VectorReduceSimplificationInfo[]): void {
        for (const transformation of transformations) {
            if (transformation.type === VectorReduceSimplificationType.COMPLETE) {
                this.applyCompleteTransformation(
                    transformation.encompassingLoop,
                    transformation.encompassingAddSubAssign,
                    transformation.removedExpressions,
                    transformation.sign
                );
                continue;
            }
            this.applyPartialTransformation(
                transformation.encompassingLoop,
                transformation.encompassingAddSubAssign,
                transformation.removedExpressions
            );
        }
    }

    private applyCompleteTransformation(
        encompassingLoop: Loop,
        encompassingAddSubAssign: BinaryOp,
        removedExpressions: ExprAndPos[],
        sign: number
    ): void {

        encompassingAddSubAssign.parent.detach();

        const delta: BinaryOp = ClavaJoinPoints.binaryOp("sub", ClavaJoinPoints.exprLiteral(encompassingLoop.endValue), ClavaJoinPoints.exprLiteral(encompassingLoop.initValue));
        const extractedExpr: Expression = this.exprListToMultNode(removedExpressions.map(val => val.expr));
        const resultingExpr: BinaryOp = ClavaJoinPoints.binaryOp("mul", ClavaJoinPoints.parenthesis(delta), extractedExpr);

        const accum: Expression = encompassingAddSubAssign.left.copy() as Expression;

        if (sign > 0) {
            encompassingLoop.insertAfter(ClavaJoinPoints.exprStmt(ClavaJoinPoints.binaryOp("add_assign", accum, resultingExpr)));
        } else {
            encompassingLoop.insertAfter(ClavaJoinPoints.exprStmt(ClavaJoinPoints.binaryOp("sub_assign", accum, resultingExpr)));
        }

        this.currentModification++;
    }

    private applyPartialTransformation(
        encompassingLoop: Loop,
        encompassingAddSubAssign: BinaryOp,
        removedExpressions: ExprAndPos[]
    ): void {
        for (const removedExpr of removedExpressions) {
            if (removedExpr.pos === ExprPos.NA) {
                throw new Error(`Tried to perform a partial transformation but removedExpr's pos is NA (should never happen, analysis is incorrect) «${removedExpr.expr.code}» [${removedExpr.expr.line}:${removedExpr.expr.column}]`);
            }

            const parentJp: Joinpoint = removedExpr.expr.parent;
            if (!(parentJp instanceof BinaryOp)) {
                throw new Error(`Tried to perform a partial transformation but removedExpr's parent expr is not a binop (should never happen, analysis is incorrect): «${parentJp.code}» [${parentJp.line}:${parentJp.column}]`);
            }

            if (parentJp.kind !== "mul") {
                throw new Error(`Tried to perform a partial transformation but removedExpr's parent expr is not a multiplication (should never happen, analysis is incorrect): «${parentJp.code}» [${parentJp.line}:${parentJp.column}]`);
            }

            const otherExprInMul: Expression = removedExpr.pos === ExprPos.RIGHT ? parentJp.left.copy() as Expression : parentJp.right.copy() as Expression;
            parentJp.replaceWith(otherExprInMul);
        }
        const accum: Varref = encompassingAddSubAssign.left.copy() as Varref;

        const tmpVar: Vardecl = ClavaJoinPoints.varDeclNoInit(`__vrs_tmp_${this.currentModification}`, accum.type);
        const tmpVarAssignment: Statement = ClavaJoinPoints.exprStmt(ClavaJoinPoints.assign(tmpVar.varref(), ClavaJoinPoints.exprLiteral('0')));
        encompassingAddSubAssign.left.replaceWith(tmpVar.varref());

        const extractedExpr: Expression = this.exprListToMultNode(removedExpressions.map(val => val.expr));
        const resultStmt: Statement = ClavaJoinPoints.exprStmt(ClavaJoinPoints.binaryOp("mul_assign", tmpVar.varref(), extractedExpr));

        encompassingLoop.insertBefore(tmpVar);
        tmpVar.insertAfter(tmpVarAssignment);

        encompassingLoop.insertAfter(resultStmt);
        resultStmt.insertAfter(ClavaJoinPoints.exprStmt(ClavaJoinPoints.binaryOp("add_assign", accum.copy() as Expression, tmpVar.varref())));

        this.currentModification++;
    }

    private exprListToMultNode(exprList: Expression[]): Expression {
        if (exprList.length === 0) throw new Error("Cannot transform an empty list into a multiplication binary op");
        if (exprList.length === 1) return exprList[0].copy() as Expression;

        return ClavaJoinPoints.binaryOp("mul", exprList[0].copy() as Expression, this.exprListToMultNode(exprList.slice(1)));
    }

    private canBeSafelyRemovedFromLoop(jp: Joinpoint, loop: Loop): boolean {
        if (this.safeToRemoveCache.has(jp.astId)) return this.safeToRemoveCache.get(jp.astId)!;

        if (jp instanceof Literal) {
            this.safeToRemoveCache.set(jp.astId, true);
            return true;
        }
        else if (jp instanceof Varref) {
            const isConstantInLoop: boolean = isConstantIn(jp, loop);
            this.safeToRemoveCache.set(jp.astId, isConstantInLoop);
            return isConstantInLoop;
        }
        else if (jp instanceof BinaryOp) {
            if (jp.kind !== "mul") {
                this.safeToRemoveCache.set(jp.astId, false);
                return false;
            }

            const safeToRemove = this.canBeSafelyRemovedFromLoop(jp.left, loop) && this.canBeSafelyRemovedFromLoop(jp.right, loop);
            this.safeToRemoveCache.set(jp.astId, safeToRemove);
            return safeToRemove;
        }
        else if (jp instanceof ArrayAccess) {
            const innerCalls: Call[] = Query.searchFrom(jp, Call).get();

            if (innerCalls.length !== 0) {
                this.safeToRemoveCache.set(jp.astId, false);
                return false;
            }

            const innerVarrefs: Varref[] = Query.searchFrom(jp, Varref, varref => varref.vardecl !== undefined).get();
            for (const innerVarref of innerVarrefs) {
                if (loop.contains(innerVarref.vardecl) || !isConstantIn(innerVarref, loop)) {
                    this.safeToRemoveCache.set(jp.astId, false);
                    return false;
                }
            }

            this.safeToRemoveCache.set(jp.astId, true);
            return true;
        }
        else if (jp instanceof ParenExpr) {
            const isRemovable = this.canBeSafelyRemovedFromLoop(jp.subExpr, loop);

            this.safeToRemoveCache.set(jp.astId, isRemovable);
            return isRemovable;
        }

        this.safeToRemoveCache.set(jp.astId, false);
        return false;
    }

    private findPossiblySuitableLoops(baseJp: Joinpoint): Loop[] {
        return Query.searchFromInclusive(baseJp, Loop, loop => {
            if (Query
                .searchFrom(loop.body, BinaryOp, binop => binop.kind === "add_assign" || binop.kind === "sub_assign")
                .get().length !== 0) {

                this.log(`Loop at [${loop.line}:${loop.column}] may be suitable for reduce simplification`);
                return true;
            }

            this.log(`Loop at [${loop.line}:${loop.column}] is not suitable for reduce simplification`);
            return false;
        }).get()
    }

}

function altersControlFlow(stmt: Statement) {
    return stmt instanceof ReturnStmt || stmt instanceof GotoStmt || stmt instanceof Break || stmt instanceof Continue;
}

/**
 * Checks if the loop's step value is an integer
 */
function hasKnownIntStepValue(loop: Loop): boolean {
    return loop.stepValue !== null && loop.stepValue !== undefined && Number.isSafeInteger(parseFloat(loop.stepValue));
}

/**
 * Checks if the loop's end value exists
 */
function hasKnownEndValue(loop: Loop): boolean {
    return loop.endValue !== null && loop.endValue !== undefined;
}

/**
 * Checks if the loop's init value exists
 */
function hasKnownInitValue(loop: Loop): boolean {
    return loop.initValue !== null && loop.initValue !== undefined;
}

function hasConstantPredictableStep(loop: Loop): boolean {
    if (loop.controlVar === undefined || loop.controlVar === null) return false;

    if (!hasKnownIntStepValue(loop)) return false;

    if (loop.controlVarref === undefined || loop.controlVarref.vardecl === undefined) return false;
    return isConstantIn(loop.controlVarref, loop.body);
}

function endValueIsConstant(loop: Loop, silent = true): boolean {
    let endValue: string = loop.endValue;

    if (endValue === undefined || endValue === null) return true;

    let endValueIsLiteral: boolean = Number.isSafeInteger(parseFloat(endValue));
    if (endValueIsLiteral) {
        try {
            ClavaJoinPoints.integerLiteral(endValue);
        } catch (e) {
            endValueIsLiteral = false;
        }
    }

    if (!endValueIsLiteral) {
        try {
            const varrefsWithEndValueName: Varref[] = Query.searchFromInclusive(loop, Varref, { name: endValue }).get();
            if (varrefsWithEndValueName.length === 0) {
                if (!silent) console.log(`\tloop's endvalue is not a literal, however it is not just a varref either, therefore it is currently impossible to determine if its value is constant: «${endValue}»`);
                return false;
            }

            for (const varref of varrefsWithEndValueName) {
                if (varref.use !== "read") {
                    if (!silent) console.log(`\tendValue is a variable that is not constant inside the loop: ${varref.parent.code}`);
                    return false;
                }
            }
        } catch (e) {
            if (!silent) console.log(`\tUnknown error when trying to process loop end value: ${e}`);
            return false;
        }
    }

    return true;
}

function hasRegularControlFlow(loop: Loop, silent = true): boolean {
    let hasNoCustomControlFlow: boolean = Query.searchFrom(loop, Statement, altersControlFlow).get().length === 0;

    if (!hasNoCustomControlFlow) {
        if (!silent) console.log(`\tLoop has control-flow altering statements`);
        return false;
    }

    if (!hasConstantPredictableStep(loop)) {
        if (!silent) console.log(`\tLoop does not have constant predictable step`);
        return false;
    }

    if (!endValueIsConstant(loop, silent)) {
        if (!silent) console.log(`\tLoop's end value is not constant`);
        return false;
    }

    return true;
}

function isVarrefOf(varref: Varref, vardecl: Vardecl): boolean {
    return varref.vardecl !== undefined && varref.vardecl !== null && varref.vardecl.astId === vardecl.astId;
}

function isConstantIn(varref: Varref, searchBaseJp: Joinpoint) {
    if (varref.vardecl === undefined || varref.vardecl === null) return false; // probably a function varref

    const vardecl: Vardecl = varref.vardecl;

    const writes: Varref[] = Query.searchFromInclusive(searchBaseJp, Varref, innerVarref => {
        return innerVarref.use !== "read" && isVarrefOf(innerVarref, vardecl);
    }).get();

    const ptrPassesToFunctions: Varref[] = Query.searchFromInclusive(searchBaseJp, Call)
        .search(UnaryOp, { kind: "addr_of" })
        .search(Varref, innerVarref => isVarrefOf(innerVarref, vardecl))
        .get();

    return writes.length === 0 && ptrPassesToFunctions.length === 0;
}

function getFirstAncestorOf<T extends typeof Joinpoint>(
    type: T,
    baseJp: Joinpoint,
    func?: (jp: InstanceType<T>) => boolean
): InstanceType<T> | undefined {
    let ancestor: Joinpoint = baseJp.parent;;

    while (ancestor !== undefined && ancestor.joinPointType.toLowerCase() !== type.name.toLowerCase()) {
        ancestor = ancestor.parent;
    }

    const correctlyTypedAncestor: InstanceType<T> = ancestor as InstanceType<T>;

    if (func === undefined || correctlyTypedAncestor === undefined || func(correctlyTypedAncestor)) return correctlyTypedAncestor;
    return undefined;
}