import { ArrayAccess, Expression, FunctionJp, InitList, Joinpoint, Literal, Param, Program, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js"
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
            const valid = this.flattenArray(arrayDecl, fun);
            cnt += valid ? 1 : 0;
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
            const valid = this.flattenArray(arrayDecl, Clava.getProgram());
            cnt += valid ? 1 : 0;
        });

        return cnt;
    }

    public flattenArray(decl: Vardecl, region: FunctionJp | Program): boolean {
        const dims = this.flattenArrayDecl(decl);
        if (dims[2] == -1) {
            return false;
        }
        const is3D = dims[0] != -1;

        for (const varref of Query.searchFrom(region, Varref)) {
            if (varref.name != decl.name || !(varref.parent instanceof ArrayAccess)) {
                continue;
            }
            if (!is3D) {
                this.flatten2DArrayRef(varref, dims[2]);
            }
            else {
                this.flatten3DArrayRef(varref, dims[1], dims[2]);
            }
        }
        return true;
    }

    private findDecls(startPoint: Joinpoint, declType: typeof Vardecl): Vardecl[] {
        const decls: Vardecl[] = [];
        for (const decl of Query.searchFrom(startPoint, declType)) {
            if (!decl.type.isArray) {
                continue;
            }
            const type = decl.type;
            if (type.arrayDims.length == 2 || type.arrayDims.length == 3) {
                decls.push(decl);
            }
            if (type.arrayDims.length > 3) {
                this.logWarning("Array with more than 2 dimensions not supported");
            }
        }
        return decls;
    }

    private flattenArrayDecl(decl: Vardecl): [number, number, number] {
        const type = decl.type;
        const dims = type.arrayDims;

        const depth = dims.length == 3 ? dims[0] : -1;
        const rows = dims.length == 3 ? dims[1] : dims[0];
        const cols = dims.length == 3 ? dims[2] : dims[1];

        if (rows == -1 || cols == -1 || rows == undefined || cols == undefined || Number.isNaN(rows) || Number.isNaN(cols)) {
            if (dims.length == 2) {
                this.logWarning(`2D array with dimensions [${rows}][${cols}] not supported`);
            }
            else {
                this.logWarning(`3D array with dimensions [${depth}][${rows}][${cols}] not supported`);
            }
            return [-1, -1, -1];
        }
        if (depth == -1 && dims.length == 3) {
            this.logWarning(`3D array with dimensions [${depth}][${rows}][${cols}] not supported`);
            return [-1, -1, -1];
        }
        const simpleType = this.simpleType(type);

        const fullSize: number[] = [rows * cols * (depth == -1 ? 1 : depth)];
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
        return [depth, rows, cols];
    };

    private flatten2DArrayRef(ref: Varref, cols: number): void {
        const rowArrayAccess = ref.parent.parent as ArrayAccess;
        const colArrayAccess = ref.parent as ArrayAccess;

        let rowExpr = rowArrayAccess.children[0] as Expression;
        let colExpr = colArrayAccess.children[1] as Expression;

        if (!(rowExpr instanceof Literal) && !(rowExpr instanceof Varref)) {
            rowExpr = ClavaJoinPoints.parenthesis(rowExpr);
        }
        if (!(colExpr instanceof Literal) && !(colExpr instanceof Varref)) {
            colExpr = ClavaJoinPoints.parenthesis(colExpr);
        }

        const litCols = ClavaJoinPoints.integerLiteral(cols);

        const mul = ClavaJoinPoints.binaryOp("*", rowExpr, litCols);
        const fullExpr = ClavaJoinPoints.binaryOp("+", mul, colExpr);

        //const access = ClavaJoinPoints.arrayAccess(ref, fullExpr);
        const access = ClavaJoinPoints.exprLiteral(`${ref.name}[${fullExpr.code}]`);
        rowArrayAccess.replaceWith(access);
    }

    private flatten3DArrayRef(ref: Varref, rows: number, cols: number): void {
        const depthArrayyAccess = ref.parent.parent.parent as ArrayAccess
        const rowArrayyAccess = ref.parent.parent as ArrayAccess;
        const colArrayyAccess = ref.parent as ArrayAccess;

        let depthExpr = depthArrayyAccess.children[0] as Expression;
        let rowExpr = rowArrayyAccess.children[1] as Expression;
        let colExpr = colArrayyAccess.children[1] as Expression;

        if (!(depthExpr instanceof Literal) && !(depthExpr instanceof Varref)) {
            depthExpr = ClavaJoinPoints.parenthesis(depthExpr);
        }
        if (!(rowExpr instanceof Literal) && !(rowExpr instanceof Varref)) {
            rowExpr = ClavaJoinPoints.parenthesis(rowExpr);
        }
        if (!(colExpr instanceof Literal) && !(colExpr instanceof Varref)) {
            colExpr = ClavaJoinPoints.parenthesis(colExpr);
        }

        const litCols = ClavaJoinPoints.integerLiteral(cols);
        const litRows = ClavaJoinPoints.integerLiteral(rows);

        const mul1 = ClavaJoinPoints.binaryOp("*", litRows, litRows);
        const mul2 = ClavaJoinPoints.binaryOp("*", depthExpr!, mul1);
        const mul3 = ClavaJoinPoints.binaryOp("*", rowExpr, litCols);
        const sum1 = ClavaJoinPoints.binaryOp("+", mul2, colExpr);
        const fullExpr = ClavaJoinPoints.binaryOp("+", mul3, sum1);

        //const access = ClavaJoinPoints.arrayAccess(ref, fullExpr);
        const access = ClavaJoinPoints.exprLiteral(`${ref.name}[${fullExpr.code}]`);
        depthArrayyAccess.replaceWith(access);
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