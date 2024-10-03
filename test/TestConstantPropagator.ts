import FoldingPropagationCombiner from "../src/FoldingPropagationCombiner.js";

function main() {
    const constPropComb = new FoldingPropagationCombiner();
    constPropComb.doPassesUntilStop();
}

main();
