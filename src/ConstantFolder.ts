import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js"
import { BinaryOp, BoolLiteral, FloatLiteral, IntLiteral, Literal, Op } from "@specs-feup/clava/api/Joinpoints.js";

export default class ConstantFolder {

    constructor() { }

    doPassesUntilStop(maxPasses = 99): number {
        let passes = 1;
        let hasChanged = this.doPass();

        while (hasChanged && passes < maxPasses) {
            hasChanged = this.doPass();
            passes++;
        }
        return passes;
    }

    doPass(): boolean {
        let hasChanged = false;

        for (const op of Query.search(BinaryOp)) {

            const isLiteral1 = op.left instanceof IntLiteral || op.left instanceof FloatLiteral;
            const isLiteral2 = op.right instanceof IntLiteral || op.left instanceof FloatLiteral;

            if (isLiteral1 && isLiteral2) {
                hasChanged = this.#fold(op);
            }
        }

        return hasChanged;
    }

    #fold(op: BinaryOp): boolean {
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

        const newLit = this.#doOperation(op.kind, n1, n2, isFloat);

        if (newLit == null) {
            return false;
        }
        else {
            op.replaceWith(newLit);
            return true;
        }
    }

    #doOperation(kind: string, n1: number, n2: number, isFloat: boolean): Literal | null {
        console.log(`[ConstantFolder] Folding constants ${n1} and ${n2} using ${kind} (${isFloat ? "float" : "int"} output)`);

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
            return this.#buildLiteral(res, isFloat);
        }
        else {
            return null;
        }
    }

    #buildLiteral(n: number, isFloat: boolean): Literal | null {
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