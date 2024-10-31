import { BinaryOp, Call, FileJp, FloatLiteral, FunctionJp, IntLiteral, Joinpoint, MemberAccess, Param, UnaryOp, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js"

export class AstDumper {
    #currentRes = "";

    constructor() { }

    dump(startJp?: Joinpoint): string {
        this.#currentRes = "";
        if (startJp == undefined) {
            startJp = Clava.getProgram();
        }

        this.#addLevelToResult(startJp.joinPointType, 0);

        for (const child of startJp.children) {
            this.#dumpJoinPoint(child, 1);
        }
        return this.#currentRes;
    }

    #buildLabel(key: string, val: string) {
        return "  {" + key + ": " + val + "}";
    }

    #dumpJoinPoint(jp: Joinpoint, indent: number) {
        var str = jp.joinPointType;

        if (jp instanceof Param || jp instanceof Vardecl || jp instanceof Varref || jp instanceof MemberAccess) {
            str += this.#buildLabel("name", jp.name) + this.#buildLabel("type", jp.type.joinPointType);
        }
        if (jp instanceof UnaryOp || jp instanceof BinaryOp) {
            str += this.#buildLabel("kind", jp.kind);
        }
        if (jp instanceof Call) {
            str += this.#buildLabel("fun", jp.name);
        }
        if (jp instanceof FunctionJp) {
            str += this.#buildLabel("sig", jp.signature);
        }
        if (jp instanceof IntLiteral || jp instanceof FloatLiteral) {
            str += this.#buildLabel("val", String(jp.value));
        }
        this.#addLevelToResult(str, indent);

        if (jp.children.length > 4) {
            var allLits = true;
            for (const child of jp.children) {
                if (!(child instanceof IntLiteral)) {
                    allLits = false;
                }
            }
            if (allLits) {
                this.#addLevelToResult(jp.joinPointType + " (" + jp.children.length + "x)", indent + 2);
                return;
            }
        }
        for (const child of jp.children) {
            this.#dumpJoinPoint(child, indent + 1);
        }
    }

    #addLevelToResult(str: string, indent: number) {
        this.#currentRes += `${'-'.repeat(indent)}>${str}\n`;
    }
}