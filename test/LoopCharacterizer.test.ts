import { Loop } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { LoopCharacterizer } from "../src/loop/LoopCharacterizer.js";
import { registerSourceCodeEach } from "./jestHelpers.js";

const source = `
void loops(void) {
    for (int i = 0; i < 10; i++) {}
    for (int j = 2; j < 10; j += 2) {}
    for (int k = 10; k > 4; k -= 2) {}
    while (0) {}
}
`;

describe("loop characterization", () => {
    registerSourceCodeEach(source);

    test("calculates trip counts for canonical for-loops", () => {
        const loops = Query.search(Loop).get();
        const characterizer = new LoopCharacterizer(true);

        expect(loops).toHaveLength(4);
        expect(loops.slice(0, 3).map(loop => characterizer.characterize(loop).tripCount))
            .toEqual([10, 4, 3]);
    });

    test("rejects unsupported while-loops", () => {
        const loop = Query.search(Loop).get()[3];
        const characterization = new LoopCharacterizer(true).characterize(loop);

        expect(characterization.isValid).toBe(false);
        expect(characterization.tripCount).toBe(-1);
    });

    test("annotates valid loops with their maximum trip count", () => {
        const loop = Query.search(Loop).first()!;
        const characterizer = new LoopCharacterizer(true);

        characterizer.annotate(loop, characterizer.characterize(loop));

        expect(loop.body.code).toContain("#pragma clava loop_tripcount max=10");
    });
});
