import ConstantFolder from "./ConstantFolder.js";
import ConstantPropagator from "./ConstantPropagator.js";


export default class FoldingPropagationCombiner {
    constructor() { }

    public doPassesUntilStop(maxPasses = 99, minPasses = 2) {
        const constFolder = new ConstantFolder();
        const constPropagator = new ConstantPropagator();

        let passes: number = 1;
        let keepGoing = true;

        do {
            const foldingChanges = constFolder.doPass();
            const propChanges = constPropagator.doPass();

            console.log(`[FoldingPropagationCombiner] Folded ${foldingChanges} expressions and replaced ${propChanges} vars by constants in pass ${passes}`);

            passes++;
            const cond1 = foldingChanges > 0 || propChanges > 0;
            const cond2 = passes < maxPasses;
            const cond3 = passes < minPasses;
            keepGoing = (cond1 && cond2) || cond3;
        }
        while (keepGoing);

        return passes;
    }
}