import { FunctionJp, Loop } from "@specs-feup/clava/api/Joinpoints.js"
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { LoopCharacterizer } from "../src/loop/LoopCharacterizer.js";

for (const fun of Query.search(FunctionJp, { name: "loop_characterization" })) {
    for (const loop of Query.searchFrom(fun, Loop)) {
        const lcz = new LoopCharacterizer();

        const characterization = lcz.characterize(loop);
        lcz.annotate(loop, characterization);

        console.log(`Annotated loop with characterization:\n${characterization}`);
    }
}