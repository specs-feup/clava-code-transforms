import { FunctionJp, Loop } from "clava-js/api/Joinpoints.js";
import Query from "lara-js/api/weaver/Query.js";
import { LoopCharacterizer } from "./LoopCharacterizer.js";

for (const fun of Query.search(FunctionJp, { name: "loop_characterization" })) {
    for (const loop of Query.searchFrom(fun, Loop)) {
        const lcz = LoopCharacterizer.characterize(loop);
        console.log(lcz);
    }
}