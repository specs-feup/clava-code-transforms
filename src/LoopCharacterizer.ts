export default class LoopCharacterizer {
    static characterize(loop: any): LoopCharacterization {
        if (!loop.instanceOf("loop")) {
            console.log("[LoopCharacterizer] ERROR: argument is not a loop");
            return LoopCharacterizer.#getDefaultCharacterization();
        }

        if (loop.kind == "for") {
            return LoopCharacterizer.#handleForLoop(loop);
        }
        if (loop.kind == "while" || loop.kind == "dowhile") {
            return LoopCharacterizer.#handleWhileLoop(loop);
        }
        return LoopCharacterizer.#getDefaultCharacterization();
    }

    static #handleForLoop(loop: any): LoopCharacterization {
        if (loop.numChildren != 4) {
            console.log("[LoopCharacterizer] ERROR: for-loop is non-canonical");
            return LoopCharacterizer.#getDefaultCharacterization();
        }
        const initExpr = loop.children[0];
        const conditionExpr = loop.children[1];
        const incrementExpr = loop.children[2];
        const body = loop.children[3];

        const initData = LoopCharacterizer.#getInitializationData(initExpr);
        const initialVal = initData[0];
        const inductionVar = initData[1];

        const condData = LoopCharacterizer.#getConditionData(conditionExpr);
        const bound = condData[0];
        const boundVar = condData[1];

        const incData = LoopCharacterizer.#getIncrementData(incrementExpr);
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
            const tripCount = LoopCharacterizer.#calculateTripCount(
                initialVal,
                bound,
                increment,
                op
            );
            charact.tripCount = tripCount;
        }
        return charact;
    }

    static #calculateTripCount(initialVal: number, bound: number, increment: number, op: string): number {
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
            return Math.floor(LoopCharacterizer.logBase(increment, iterationSpace));
        }
        return -1;
    }

    static logBase(base: number, n: number): number {
        return Math.log(n) / Math.log(base);
    }

    static #getInitializationData(initExpr: any): [number, string] {
        if (initExpr.numChildren == 0) {
            return [-1, "nil"];
        }

        // case: int i = 0
        if (initExpr.children[0].instanceOf("vardecl")) {
            const varDecl = initExpr.children[0];
            const name = varDecl.name;

            if (
                varDecl.numChildren == 1 &&
                varDecl.children[0].instanceOf("intLiteral")
            ) {
                const initVal = varDecl.children[0].value;
                return [initVal, name];
            } else {
                return [-1, name];
            }
        }
        // case: i = 0
        if (
            initExpr.children[0].instanceOf("binaryOp") &&
            initExpr.children[0].kind == "assign"
        ) {
            const binaryOp = initExpr.children[0];
            const lhs = binaryOp.children[0];
            const rhs = binaryOp.children[1];

            if (lhs.instanceOf("varref") && rhs.instanceOf("intLiteral")) {
                const initVal = rhs.value;
                const name = lhs.name;
                return [initVal, name];
            } else return [-1, "nil"];
        }
        return [-1, "nil"];
    }

    static #getConditionData(condExpr: any): [number, string] {
        if (
            condExpr.numChildren == 1 &&
            condExpr.children[0].instanceOf("binaryOp")
        ) {
            const binaryOp = condExpr.children[0];
            const lhs = binaryOp.children[0];
            const rhs = binaryOp.children[1];

            if (lhs.instanceOf("varref") && rhs.instanceOf("intLiteral")) {
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
            if (lhs.instanceOf("intLiteral") && rhs.instanceOf("varref")) {
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

    static #getIncrementData(incExpr: any): [number, string, string] {
        if (incExpr.numChildren == 1 && incExpr.children[0].instanceOf("unaryOp")) {
            return LoopCharacterizer.#handleUnaryIncrement(incExpr);
        }
        if (
            incExpr.numChildren == 1 &&
            incExpr.children[0].instanceOf("binaryOp")
        ) {
            return LoopCharacterizer.#handleBinaryIncrement(incExpr);
        }
        return [-1, "nil", "nop"];
    }

    static #handleUnaryIncrement(incExpr: any): [number, string, string] {
        const unaryOp = incExpr.children[0];
        const operand = unaryOp.children[0];

        if (operand.instanceOf("varref")) {
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

    static #handleBinaryIncrement(incExpr: any): [number, string, string] {
        const binaryOp = incExpr.children[0];
        const lhs = binaryOp.children[0];
        const rhs = binaryOp.children[1];

        let incVar = "nil";
        let inc = -1;
        let opKind = "nop";

        // e.g., i += 2
        if (lhs.instanceOf("varref") && rhs.instanceOf("intLiteral")) {
            incVar = lhs.name;
            inc = rhs.value;
            opKind = binaryOp.kind;
        }
        // e.g., i = i + 2
        else if (
            lhs.instanceOf("varref") &&
            rhs.instanceOf("binaryOp") &&
            binaryOp.kind == "assign"
        ) {
            incVar = lhs.name;
            const childOp = rhs;
            const childLhs = childOp.children[0];
            const childRhs = childOp.children[1];

            const childVar = childLhs.instanceOf("varref") ? childLhs : childRhs;
            const childInc = childLhs.instanceOf("intLiteral") ? childLhs : childRhs;

            if (childVar.name == incVar) {
                inc = childInc.value;
                opKind = childOp.kind;
            } else {
                return [-1, "nil", "nop"];
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

    static #handleWhileLoop(loop: any): LoopCharacterization {
        console.log(
            "[LoopCharacterizer] ERROR: while and do-while loops are not yet supported"
        );
        return LoopCharacterizer.#getDefaultCharacterization();
    }

    static #getDefaultCharacterization(): LoopCharacterization {
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