import { registerSourceCode } from "lara-js/jest/jestHelpers.js";

import { foo } from "./foo.js";

const code = `
void query_loop() {
    for(int i=0; i<10; i++) {
    }
}

int query_empty() {
    int a;
    return a + 2;
}

int query_regex() {
    return 0;
}
`;

describe("Foo", () => {
    registerSourceCode(code);

    it("should pass", () => {
        expect(foo()).toBe(3);
    });

    it("should fail", () => {
        expect(foo()).toBe(2);
    });
});
