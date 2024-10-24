import { FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import ConstantPropagator from "./ConstantPropagator.js";
import { FunctionConstantFolder, GlobalConstantFolder } from "./ConstantFolder.js";

export default class FoldingPropagationCombiner {
    constructor() { }

    public doPassesUntilStop(fun: FunctionJp, maxPasses: number = 99, minPasses: number = 2): number {
        const globalConstFolder = new GlobalConstantFolder();
        const funConstFolder = new FunctionConstantFolder(fun);

        const constPropagator = new ConstantPropagator(fun);

        let passes: number = 1;
        let keepGoing = true;

        console.log(`[FoldingPropagationCombiner] Starting passes for function: ${fun.name}`);
        do {
            const globalFolds = globalConstFolder.doPass();
            const funFolds = funConstFolder.doPass();
            const totalFolds = globalFolds + funFolds;

            const propChanges = constPropagator.doPass();

            console.log(`[FoldingPropagationCombiner] --- Pass ${passes}: globalFolds=${globalFolds}, funFolds=${funFolds}, propagations=${propChanges}`);

            passes++;
            const cond1 = totalFolds > 0 || propChanges > 0;
            const cond2 = passes < maxPasses;
            const cond3 = passes < minPasses;
            keepGoing = (cond1 && cond2) || cond3;
        }
        while (keepGoing);

        return passes;
    }
}