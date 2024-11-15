import Query from "@specs-feup/lara/api/weaver/Query.js";
import { ArrayFlattener } from "../src/ArrayFlattener.js";
import { FoldingPropagationCombiner } from "../src/constfolding/FoldingPropagationCombiner.js";
import { AstDumper } from "./AstDumper.js";
import { FunctionJp, InitList, Vardecl } from "@specs-feup/clava/api/Joinpoints.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";

function convertExprLit() {
    for (const decl of Query.search(Vardecl)) {
        if (decl.children[0] instanceof InitList) {
            const initList = decl.children[0] as InitList;

            if (initList.children.length > 50) {
                const exprLit = ClavaJoinPoints.exprLiteral(initList.code);
                initList.removeChildren();
                initList.setFirstChild(exprLit);
            }
        }
    }
}

function flow(enableExprLit: boolean = false) {
    if (enableExprLit) {
        convertExprLit();
    }

    const dumper = new AstDumper();
    console.log(dumper.dump());

    const arrayFlattener = new ArrayFlattener();
    arrayFlattener.flattenAll();

    Clava.rebuild();
    if (enableExprLit) {
        convertExprLit();
    }

    const folder = new FoldingPropagationCombiner();
    for (const fun of Query.search(FunctionJp)) {
        folder.doPassesUntilStop(fun);
    }

    Clava.rebuild();
    if (enableExprLit) {
        convertExprLit();
    }
}

flow(true);