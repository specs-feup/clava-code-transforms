import { ArrayAccess, Expression, FunctionJp, InitList, Joinpoint, Literal, Param, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js"
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AdvancedTransform } from "./AdvancedTransform.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";

export class ArrayFlattener extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("ArrayFlattener", silent);
    }

    public flattenAll(): number {
        let cnt = 0;

        for (const fun of Query.search(FunctionJp)) {
            const n = this.flattenAllInFunction(fun);
            this.log(`Flattened ${n} array(s) in function ${fun.name}`);
            cnt += n;
        }

        const n = this.flattenAllGlobals();
        this.log(`Flattened ${n} global array(s)`);
        cnt += n;

        return cnt;
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
                if (varref.name != arrayDecl.name || !(varref.parent instanceof ArrayAccess)) {
                    continue;
                }
                this.flattenArrayRef(varref, cols);
            }
            cnt++;
        });

        return cnt;
    }

    public flattenAllGlobals(): number {
        const arrays: Vardecl[] = [];

        const decls = this.findDecls(Clava.getProgram(), Vardecl);
        decls.forEach((decl) => {
            if (decl.isGlobal) {
                arrays.push(decl);
            }
        });

        let cnt = 0;
        arrays.forEach((arrayDecl) => {
            const cols = this.flattenArrayDecl(arrayDecl);

            for (const varref of Query.searchFrom(Query.root(), Varref)) {
                if (varref.name != arrayDecl.name || !(varref.parent instanceof ArrayAccess)) {
                    continue;
                }
                this.flattenArrayRef(varref, cols);
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

            if (decl.children.length > 0) {
                if (decl.children[0] instanceof InitList) {
                    const init = this.getInitList(decl.children[0]);
                    newDecl.setInit(init);
                }
                else {
                    this.logWarning("Array with initializer not supported, maintaining original initializer");
                    const init = decl.children[0].copy() as Expression;
                    newDecl.setInit(init);
                }
            }
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

        const mul = ClavaJoinPoints.binaryOp("*", secondExpr, lit);
        const fullExpr = ClavaJoinPoints.binaryOp("+", mul, firstExpr);

        //const access = ClavaJoinPoints.arrayAccess(ref, fullExpr);
        const access = ClavaJoinPoints.exprLiteral(`${ref.name}[${fullExpr.code}]`);
        firstArrAccess.replaceWith(access);
    }

    private getInitList(initList: InitList): InitList {
        const newList = this.getInitSublist(initList);
        const newListCode = `{${newList.map((lit) => lit.code).join(", ")}}`;

        const expr = ClavaJoinPoints.exprLiteral(newListCode);
        return expr as InitList;
    }

    private getInitSublist(initList: InitList): Literal[] {
        const newList: Literal[] = [];

        for (const elem of initList.children) {
            if (elem instanceof InitList) {
                newList.push(...this.getInitSublist(elem));
            }
            else {
                newList.push(elem as Literal);
            }
        }
        return newList;
    }
}