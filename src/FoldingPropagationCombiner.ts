laraImport("clava.code.ConstantPropagator");
laraImport("clava.code.ConstantFolder");

class FoldingPropagationCombiner {
    constructor() { }

    doPassesUntilStop(maxPasses = 99, minPasses = 2) {
        const constFolder = new ConstantFolder();
        const constPropagator = new ConstantPropagator();

        let passes = 0;
        let foldingChanges = true;
        let propChanges = true;
        let keepGoing = true;

        do {
            foldingChanges = constFolder.doPass();
            propChanges = constPropagator.doPass();

            passes++;
            const cond1 = foldingChanges || propChanges;
            const cond2 = passes < maxPasses;
            const cond3 = passes < minPasses;
            keepGoing = (cond1 && cond2) || cond3;
        }
        while (keepGoing);

        return passes;
    }
}