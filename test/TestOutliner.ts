import { Pragma, Scope, Statement, WrapperStmt } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import Outliner from "../src/Outliner.js";
import { AstDumper } from "./AstDumper.js";

function main() {
    const dumper = new AstDumper();
    const astDump = dumper.dump();
    console.log(astDump);

    // We want the wrapper statement around the pragma, not the pragma itself
    // as the wrapper statements both share the same parent (i.e., are on the same scope)
    for (const beginPragma of Query.search(Pragma, { "content": "begin_outline" })) {
        const beginWrapper = beginPragma.parent as WrapperStmt;
        let endWrapper = beginWrapper as WrapperStmt;
        const scope = beginWrapper.parent as Scope;

        for (const stmt of scope.children) {
            let foundBegin = false;
            if (stmt === beginWrapper) {
                foundBegin = true;
                continue;
            }

            if (stmt instanceof WrapperStmt) {
                const pragma = stmt.children[0];
                if (pragma instanceof Pragma && pragma.content === "end_outline" && foundBegin) {
                    endWrapper = stmt;
                    break;
                }
            }
        }

        if (beginWrapper == null || endWrapper == null) {
            console.log("Could not find the region for outlining! Begin = " + beginWrapper + ", end = " + endWrapper);
            continue;
        }
        else {
            processOutliningRegion(beginWrapper, endWrapper);
        }
    }
}

function processOutliningRegion(beginPragma: WrapperStmt, endPragma: WrapperStmt) {
    const begin = beginPragma.siblingsRight[0] as Statement; // Stmt immediately before the first pragma
    const end = endPragma.siblingsLeft[endPragma.siblingsLeft.length - 1] as Statement; // Stmt immediately after the last pragma
    beginPragma.detach();
    endPragma.detach();

    console.log("Beginning the outline process...");
    const outliner = new Outliner();
    outliner.outline(begin, end);
    console.log("Outlining finished!");
}

main();