import { FunctionJp, Loop } from "@specs-feup/clava/api/Joinpoints.js"
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { LoopCharacterizer } from "../src/LoopCharacterizer.js";

for (const fun of Query.search(FunctionJp, { name: "loop_characterization" })) {
    for (const loop of Query.searchFrom(fun, Loop)) {
        const lcz = LoopCharacterizer.characterize(loop);
        console.log(lcz);
    }
}