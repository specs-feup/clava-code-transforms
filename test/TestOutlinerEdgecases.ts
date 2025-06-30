import { Outliner } from "@specs-feup/clava-code-transforms/Outliner";
import { WrapperStmt } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

let begin: WrapperStmt | undefined;
let end: WrapperStmt | undefined;
for (const stmt of Query.search(WrapperStmt)) {
    if (stmt.code.trim().includes("#pragma clava begin_outline")) {
        begin = stmt;
    }
    if (stmt.code.trim().includes("#pragma clava end_outline")) {
        end = stmt;
    }
}

if (begin && end) {
    const outliner = new Outliner();

    outliner.outlineWithWrappers(begin, end);
}