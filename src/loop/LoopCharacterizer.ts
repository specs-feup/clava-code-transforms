import { BinaryOp, IntLiteral, Loop, UnaryOp, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "./AdvancedTransform.js";

export class LoopCharacterizer extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("LoopCharacterizer", silent);
    }

    public characterize(loop: Loop): LoopCharacterization {
        if (loop.kind == "for") {
            return this.handleForLoop(loop);
        }
        if (loop.kind == "while" || loop.kind == "dowhile") {
            return this.handleWhileLoop(loop);
        }
        return this.getDefaultCharacterization();
    }

    private handleForLoop(loop: Loop): LoopCharacterization {
        if (loop.numChildren != 4) {
            this.logError("for-loop is non-canonical");
            return this.getDefaultCharacterization();
        }
        const initExpr = loop.children[0];
        const conditionExpr = loop.children[1];
        const incrementExpr = loop.children[2];
        const body = loop.children[3];

        const initData = this.getInitializationData(initExpr);
        const initialVal = initData[0];
        const inductionVar = initData[1];

        const condData = this.getConditionData(conditionExpr);
        const bound = condData[0];
        const boundVar = condData[1];

        const incData = this.getIncrementData(incrementExpr);
        const increment = incData[0];
        const incrementVar = incData[1];
        const op = incData[2];

        const charact: LoopCharacterization = {
            isValid: true,
            inductionVar: inductionVar,
            boundVar: boundVar,
            incrementVar: incrementVar,
            initialVal: initialVal,
            bound: bound,
            increment: increment,
            op: op,
            tripCount: -1
        };

        if (inductionVar == boundVar || boundVar == incrementVar) {
            const tripCount = this.calculateTripCount(
                initialVal,
                bound,
                increment,
                op
            );
            charact.tripCount = tripCount;
        }
        return charact;
    }

    private calculateTripCount(initialVal: number, bound: number, increment: number, op: string): number {
        const iterationSpace = Math.abs(bound - initialVal);

        if (op == "add" || op == "sub") {
            if (increment == 0) {
                return -1;
            }

            if (initialVal > bound && op == "add") {
                return -1;
            }
            if (initialVal < bound && op == "sub") {
                return -1;
            }
            return Math.floor(iterationSpace / Math.abs(increment));
        }
        if (op == "mul" || op == "div") {
            if (increment == 1 || increment == 0) {
                return -1;
            }
            return Math.floor(this.logBase(increment, iterationSpace));
        }
        return -1;
    }

    private logBase(base: number, n: number): number {
        return Math.log(n) / Math.log(base);
    }

    private getInitializationData(initExpr: any): [number, string] {
        if (initExpr.numChildren == 0) {
            return [-1, "nil"];
        }

        // case: int i = 0
        if (initExpr.children[0] instanceof Vardecl) {
            const varDecl = initExpr.children[0];
            const name = varDecl.name;

            if (
                varDecl.numChildren == 1 &&
                varDecl.children[0] instanceof IntLiteral
            ) {
                const initVal = varDecl.children[0].value;
                return [initVal, name];
            } else {
                return [-1, name];
            }
        }
        // case: i = 0
        if (
            initExpr.children[0] instanceof BinaryOp &&
            initExpr.children[0].kind == "assign"
        ) {
            const binaryOp = initExpr.children[0];
            const lhs = binaryOp.children[0];
            const rhs = binaryOp.children[1];

            if (lhs instanceof Varref && rhs instanceof IntLiteral) {
                const initVal = rhs.value;
                const name = lhs.name;
                return [initVal, name];
            } else return [-1, "nil"];
        }
        return [-1, "nil"];
    }

    private getConditionData(condExpr: any): [number, string] {
        if (
            condExpr.numChildren == 1 &&
            condExpr.children[0] instanceof BinaryOp
        ) {
            const binaryOp = condExpr.children[0];
            const lhs = binaryOp.children[0];
            const rhs = binaryOp.children[1];

            if (lhs instanceof Varref && rhs instanceof IntLiteral) {
                const boundVar = lhs.name;
                const bound = rhs.value;

                switch (binaryOp.kind) {
                    case "lt":
                    case "gt":
                        return [bound, boundVar];
                    case "le":
                        return [bound + 1, boundVar];
                    case "ge":
                        return [bound - 1, boundVar];
                    default:
                        return [-1, boundVar];
                }
            }
            if (lhs instanceof IntLiteral && rhs instanceof Varref) {
                const boundVar = rhs.name;
                const bound = lhs.value;

                switch (binaryOp.kind) {
                    case "lt":
                        return [bound, boundVar];
                    case "gt":
                        return [bound, boundVar];
                    case "le":
                        return [bound - 1, boundVar];
                    case "ge":
                        return [bound + 1, boundVar];
                    default:
                        return [-1, boundVar];
                }
            }
        }
        return [-1, "nil"];
    }

    private getIncrementData(incExpr: any): [number, string, string] {
        if (incExpr.numChildren == 1 && incExpr.children[0] instanceof UnaryOp) {
            return this.handleUnaryIncrement(incExpr);
        }
        if (
            incExpr.numChildren == 1 &&
            incExpr.children[0] instanceof BinaryOp
        ) {
            return this.handleBinaryIncrement(incExpr);
        }
        return [-1, "nil", "nop"];
    }

    private handleUnaryIncrement(incExpr: any): [number, string, string] {
        const unaryOp = incExpr.children[0];
        const operand = unaryOp.children[0];

        if (operand instanceof Varref) {
            const incVar = operand.name;
            const inc = 1;

            switch (unaryOp.kind) {
                case "pre_inc":
                    return [inc, incVar, "add"];
                case "pre_dec":
                    return [-inc, incVar, "sub"];
                case "post_inc":
                    return [inc, incVar, "add"];
                case "post_dec":
                    return [-inc, incVar, "sub"];
                default:
                    return [-1, incVar, "nop"];
            }
        }
        return [-1, "nil", "nop"];
    }

    private handleBinaryIncrement(incExpr: any): [number, string, string] {
        const binaryOp = incExpr.children[0];
        const lhs = binaryOp.children[0];
        const rhs = binaryOp.children[1];

        let incVar = "nil";
        let inc = -1;
        let opKind = "nop";

        // e.g., i += 2
        if (lhs instanceof Varref && rhs instanceof IntLiteral) {
            incVar = lhs.name;
            inc = rhs.value;
            opKind = binaryOp.kind;
        }
        // e.g., i = i + 2
        else if (
            lhs instanceof Varref &&
            rhs instanceof BinaryOp &&
            binaryOp.kind == "assign"
        ) {
            incVar = lhs.name;
            const childOp = rhs;
            const childLhs = childOp.children[0];
            const childRhs = childOp.children[1];

            if (childLhs instanceof Varref && childRhs instanceof IntLiteral) {
                if (childLhs.name == incVar) {
                    inc = childRhs.value;
                    opKind = childOp.kind;
                } else {
                    return [-1, "nil", "nop"];
                }

            }
            if (childLhs instanceof IntLiteral && childRhs instanceof Varref) {
                if (childRhs.name == incVar) {
                    inc = childLhs.value;
                    opKind = childOp.kind;
                }
                else {
                    return [-1, "nil", "nop"];
                }
            }
        }
        // anything weirder than that is not supported
        else {
            return [-1, "nil", "nop"];
        }

        switch (opKind) {
            case "add":
            case "add_assign":
                return [inc, incVar, "add"];
            case "sub":
            case "sub_assign":
                return [-inc, incVar, "sub"];
            case "mul":
            case "mul_assign":
                return [inc, incVar, "mul"];
            case "div":
            case "div_assign":
                return [inc, incVar, "div"];
            default:
                return [-1, incVar, "nop"];
        }
    }

    private handleWhileLoop(loop: any): LoopCharacterization {
        this.logWarning("while and do-while loops are not yet supported, ignoring...");
        return this.getDefaultCharacterization();
    }

    private getDefaultCharacterization(): LoopCharacterization {
        return {
            isValid: false,
            inductionVar: "nil",
            boundVar: "nil",
            incrementVar: "nil",
            initialVal: -1,
            bound: -1,
            increment: -1,
            op: "nop",
            tripCount: -1
        };
    }
}

export type LoopCharacterization = {
    isValid: boolean;
    inductionVar: string;
    boundVar: string;
    incrementVar: string;
    initialVal: number;
    bound: number;
    increment: number;
    op: string;
    tripCount: number;
}