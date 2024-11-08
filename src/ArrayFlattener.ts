import { ArrayAccess, Expression, FunctionJp, Joinpoint, Literal, Param, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import IdGenerator from "@specs-feup/lara/api/lara/util/IdGenerator.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AdvancedTransform } from "./AdvancedTransform.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";

export class ArrayFlattener extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("ArrayFlattener", silent);
    }

    public flattenAllInFunction(fun: FunctionJp): number {
        const uniqueArrayIDs: Set<string> = new Set();
        const arrays: Vardecl[] = [];

        const params = this.findDecls(fun, Param);
        params.forEach((param) => {
            uniqueArrayIDs.add(param.astId);
            arrays.push(param);
        });

        const decls = this.findDecls(fun, Vardecl);
        decls.forEach((decl) => {
            if (!uniqueArrayIDs.has(decl.astId)) {
                uniqueArrayIDs.add(decl.astId);
                arrays.push(decl);
            }
        });

        let cnt = 0;
        arrays.forEach((arrayDecl) => {
            const cols = this.flattenArrayDecl(arrayDecl);

            for (const varref of Query.searchFrom(fun, Varref)) {
                if (varref.name != arrayDecl.name) {
                    continue;
                }
                //this.flattenArrayRef(varref, cols);
            }
            cnt++;
        });

        return cnt;
    }

    private findDecls(startPoint: Joinpoint, declType: typeof Vardecl): Vardecl[] {
        const decls: Vardecl[] = [];
        for (const decl of Query.searchFrom(startPoint, declType)) {
            if (!decl.type.isArray) {
                continue;
            }
            const type = decl.type;
            if (type.arrayDims.length == 2) {
                decls.push(decl);
            }
            if (type.arrayDims.length > 2) {
                this.logWarning("Array with more than 2 dimensions not supported");
            }
        }
        return decls;
    }

    private flattenArrayDecl(decl: Vardecl): number {
        const type = decl.type;
        const dims = type.arrayDims;

        const rows = dims[0];
        const cols = dims[1];

        if (rows == -1 || cols == -1 || Number.isNaN(rows) || Number.isNaN(cols) || rows == undefined || cols == undefined) {
            this.logWarning("Array with unknown dimensions not supported");
            return -1;
        }
        const simpleType = this.simpleType(type);

        const fullSize: number[] = [rows * cols];
        const newTypeJp = ClavaJoinPoints.constArrayType(simpleType, ...fullSize);

        if (decl instanceof Param) {
            const newParam = ClavaJoinPoints.param(decl.name, newTypeJp);
            decl.replaceWith(newParam);
        }
        else {
            const newDecl = ClavaJoinPoints.varDeclNoInit(decl.name, newTypeJp);
            decl.replaceWith(newDecl);
        }
        return cols;
    }

    private flattenArrayRef(ref: Varref, cols: number): void {
        const firstArrAccess = ref.parent.parent as ArrayAccess;
        const secondArrAccess = ref.parent as ArrayAccess;

        let firstExpr = firstArrAccess.children[0] as Expression;
        let secondExpr = secondArrAccess.children[1] as Expression;

        if (!(firstExpr instanceof Literal) && !(firstExpr instanceof Varref)) {
            firstExpr = ClavaJoinPoints.parenthesis(firstExpr);
        }
        if (!(secondExpr instanceof Literal) && !(secondExpr instanceof Varref)) {
            secondExpr = ClavaJoinPoints.parenthesis(secondExpr);
        }
        const lit = ClavaJoinPoints.integerLiteral(cols);

        const mul = ClavaJoinPoints.binaryOp("*", firstExpr, lit);
        const add = ClavaJoinPoints.binaryOp("+", mul, secondExpr);

        const access = ClavaJoinPoints.arrayAccess(ref, add);
        firstArrAccess.replaceWith(access);
    }
}