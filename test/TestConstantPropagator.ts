laraImport("clava.code.FoldingPropagationCombiner");
laraImport("weaver.Query");

function main() {
    const constPropComb = new FoldingPropagationCombiner();
    constPropComb.doPassesUntilStop();
}

main();
