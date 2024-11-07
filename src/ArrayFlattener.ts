import { ArrayAccess, Expression, FunctionJp, Param, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import IdGenerator from "@specs-feup/lara/api/lara/util/IdGenerator.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AdvancedTransform } from "./AdvancedTransform.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";

export class ArrayFlattener extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("ArrayFlattener", silent);
    }

    public flattenAllInFunction(fun: FunctionJp): number {
        for (const param of Query.searchFrom(fun, Param)) {
            if (!param.type.isArray) {
                continue;
            }
            const type = param.type;

            if (type.arrayDims.length == 2) {
                this.flattenParameterArray(fun, param);
            }
            if (type.arrayDims.length > 2) {
                this.logWarning("Array with more than 2 dimensions not supported");
            }
        }

        return 0;
    }

    private flattenParameterArray(fun: FunctionJp, arrayParam: Param): void {
        const type = arrayParam.type;
        const dims = type.arrayDims;

        const rows = dims[0];
        const cols = dims[1];

        if (rows == -1 || cols == -1) {
            this.logWarning("Array with unknown dimensions not supported");
            return;
        }
        const simpleType = this.simpleType(type);
        const simpleTypeJp = ClavaJoinPoints.type(simpleType);

        const fullSize = rows * cols;
        const newTypeJp = ClavaJoinPoints.constArrayType(simpleType, fullSize);

        arrayParam.setType(newTypeJp);

        for (const varref of Query.searchFrom(fun, Varref)) {
            if (varref.name != arrayParam.name) {
                continue;
            }
            this.flattenArrayRef(varref, cols);
        }
    }

    private flattenArrayRef(ref: Varref, cols: number): void {
        const a1 = ref.parent as ArrayAccess;
        const a2 = ref.parent.parent as ArrayAccess;

        const expr1 = a1.children[1] as Expression;
        const expr2 = a2.children[0] as Expression;

        const parLhs = ClavaJoinPoints.parenthesis(expr1);
        const parRhs = ClavaJoinPoints.parenthesis(expr2);
        const lit = ClavaJoinPoints.integerLiteral(cols);

        const mul = ClavaJoinPoints.binaryOp("*", parLhs, lit);
        const add = ClavaJoinPoints.binaryOp("+", mul, parRhs);

        const access = ClavaJoinPoints.arrayAccess(ref, add);
        a2.replaceWith(access);
    }

    private flattenLocalArray(fun: FunctionJp, arrayVar: Varref): void {

    }
}