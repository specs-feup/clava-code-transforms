laraImport("clava.code.Voidifier");
laraImport("clava.code.StatementDecomposer");
laraImport("clava.opt.NormalizeToSubset");
laraImport("weaver.Query");

function reduceToSubset() {
    for (const fun of Query.search("function", { "isImplementation": true })) {
        const body = fun.body;
        NormalizeToSubset(body, { simplifyLoops: { forToWhile: false } });
    }

    const decomp = new StatementDecomposer();
    for (var stmt of Query.search("statement", { isInsideHeader: false })) {
        decomp.decomposeAndReplace(stmt);
    }
}

function main() {
    reduceToSubset();

    const vf = new Voidifier();
    for (const fun of Query.search("function", { "isImplementation": true })) {
        if (fun.name != "main") {
            vf.voidify(fun, "return_value");
        }
    }
}

main();