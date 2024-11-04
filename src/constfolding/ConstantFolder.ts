import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js"
import { BinaryOp, BoolLiteral, FloatLiteral, FunctionJp, IntLiteral, Literal, Vardecl } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";

export abstract class ConstantFolder extends AdvancedTransform {

    constructor(silent: boolean = false) {
        super("FoldingPropagation-ConstFolder", silent);
    }

    public doPass(): number {
        let folds = 0;

        for (const op of this.getBinaryOps()) {

            const isLiteral1 = op.left instanceof Literal;
            const isLiteral2 = op.right instanceof Literal;

            if (isLiteral1 && isLiteral2) {
                folds += this.fold(op) ? 1 : 0;
            }
        }

        return folds;
    }

    public static getLiteralValue(lit: Literal): number {
        if (lit instanceof IntLiteral) {
            return lit.value;
        }
        else if (lit instanceof FloatLiteral) {
            return lit.value;
        }
        else if (lit instanceof BoolLiteral) {
            return lit.value ? 1 : 0;
        }
        return NaN;
    }

    protected abstract getBinaryOps(): BinaryOp[];

    private fold(op: BinaryOp): boolean {
        const leftLit = op.left;
        const rightLit = op.right;

        let n1: number = NaN;
        let n2: number = NaN;

        if (leftLit instanceof IntLiteral || leftLit instanceof FloatLiteral) {
            n1 = leftLit.value;
        }
        if (rightLit instanceof IntLiteral || rightLit instanceof FloatLiteral) {
            n2 = rightLit.value;
        }
        if (leftLit instanceof BoolLiteral) {
            n1 = leftLit.value ? 1 : 0;
        }
        if (rightLit instanceof BoolLiteral) {
            n2 = rightLit.value ? 1 : 0;
        }

        if (isNaN(n1) || isNaN(n2)) {
            return false;
        }

        const isFloat = leftLit instanceof FloatLiteral || rightLit instanceof FloatLiteral;

        const newLit = this.doOperation(op.kind, n1, n2, isFloat);

        if (newLit == null) {
            return false;
        }
        else {
            op.replaceWith(newLit);
            return true;
        }
    }

    private doOperation(kind: string, n1: number, n2: number, isFloat: boolean): Literal | null {
        let res: number = 0;

        switch (kind) {
            case "mul":
                res = n1 * n2;
                break;
            case "div":
                if (n2 == 0) {
                    return null;
                }
                if (isFloat) {
                    res = n1 / n2;
                }
                else {
                    res = Math.floor(n1 / n2);
                }
                break;
            case "rem":
                res = n1 % n2;
                break;
            case "add":
                res = n1 + n2;
                break;
            case "sub":
                res = n1 - n2;
                break;
            case "shl":
                res = n1 << n2;
                break;
            case "shr":
                res = n1 >> n2;
                break;
            case "cmp":
                // no idea
                break;
            case "lt":
                res = Number(n1 < n2);
                break;
            case "gt":
                res = Number(n1 > n2);
                break;
            case "le":
                res = Number(n1 <= n2);
                break;
            case "ge":
                res = Number(n1 >= n2);
                break;
            case "eq":
                res = Number(n1 == n2);
                break;
            case "ne":
                res = Number(n1 != n2);
                break;
            case "and":
                res = n1 & n2;
                break;
            case "xor":
                res = n1 ^ n2;
                break;
            case "or":
                res = n1 | n2;
                break;
            case "l_and":
                res = n1 && n2;
                res = Number(res);
                break;
            case "l_or":
                res = n1 || n2;
                res = Number(res);
                break;
            default:
                break;
        }
        if (res != null) {
            return this.buildLiteral(res, isFloat);
        }
        else {
            return null;
        }
    }

    private buildLiteral(n: number, isFloat: boolean): Literal | null {
        if (Number.isNaN(n)) {
            return null;
        }
        if (isFloat) {
            return ClavaJoinPoints.doubleLiteral(n);
        }
        else {
            const flooredN = Math.floor(n);
            return ClavaJoinPoints.integerLiteral(flooredN);
        }
    }
}

export class FunctionConstantFolder extends ConstantFolder {
    private fun: FunctionJp;

    constructor(fun: FunctionJp) {
        super();
        this.fun = fun;
    }

    protected getBinaryOps(): BinaryOp[] {
        const ops: BinaryOp[] = [];

        for (const op of Query.searchFrom(this.fun, BinaryOp)) {
            ops.push(op);
        }

        return ops;
    }
}

export class GlobalConstantFolder extends ConstantFolder {
    protected getBinaryOps(): BinaryOp[] {
        const ops: BinaryOp[] = [];

        for (const global of Query.search(Vardecl)) {
            if (global.isGlobal && global.hasInit) {
                for (const op of Query.searchFrom(global, BinaryOp)) {
                    ops.push(op);
                }
            }

        }
        return ops;
    }
}