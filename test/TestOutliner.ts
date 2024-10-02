laraImport("weaver.WeaverJps");
laraImport("weaver.Query");
laraImport("clava.ClavaJoinPoints");
laraImport("clava.code.Outliner");
//laraImport("AstDumper");


function main() {
    // We want the wrapper statement around the pragma, not the pragma itself
    // as the wrapper statements both share the same parent (i.e., are on the same scope)
    //const dumper = new AstDumper();
    //dumper.dump();

    for (const pragma of Query.search("pragma", { "content": "begin_outline" })) {
        var beginPragma = pragma.parent;
        var endPragma = null;

        var next = beginPragma.rightJp;
        while (next != null) {
            if (next.joinPointType === "wrapperStmt" && next.numChildren > 0) {
                if (next.children[0].content === "end_outline") {
                    endPragma = next;
                    break;
                }
            }
            next = next.rightJp;
        }
        if (beginPragma == null || endPragma == null) {
            println("Could not find the region for outlining! Begin = " + beginPragma + ", end = " + endPragma);
            continue;
        }
        else {
            processOutliningRegion(beginPragma, endPragma);
        }
    }
}

function processOutliningRegion(beginPragma, endPragma) {
    const begin = beginPragma.siblingsRight[0];
    const end = endPragma.siblingsLeft[endPragma.siblingsLeft.length - 1];
    beginPragma.detach();
    endPragma.detach();

    println("Beginning the outline process...");
    const outliner = new Outliner();
    outliner.outline(begin, end);
    println("Outlining finished!");
}

main();