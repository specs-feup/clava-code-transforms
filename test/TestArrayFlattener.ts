laraImport("clava.code.ArrayFlattener");
laraImport("weaver.Query");

function main() {

    for (const loop of Query.search("function")) {
        const arrayFlattener = new ArrayFlattener();
        arrayFlattener.flattenAllInFunction(loop);
    }
}

main();
