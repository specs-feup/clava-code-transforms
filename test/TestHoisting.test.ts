import Query from "@specs-feup/lara/api/weaver/Query.js";
import { CallHoisting } from "../src/function/CallHoisting.js";
import { Call, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { registerSourceCode } from "@specs-feup/lara/jest/jestHelpers.js";

const code = `
#include <stdlib.h>
#include <stdio.h>

int canHoistPrintf(int a, int b)
{
    printf("%d %d\n", a, b);
    int c = a + b;
    return c;
}

int cannotHoistPrintf(int a, int b)
{
    int c = a + b;
    printf("%d\n", c);
    return c;
}

int calledMultipleTimes(int a, int b)
{
    int c = a + b;
    printf("%d\n", c);
    return c;
}

int main()
{
    int a = 5;
    int b = 10;
    int c = canHoistPrintf(a, b);
    int d = cannotHoistPrintf(a, b);
    int e = calledMultipleTimes(a, b);
    int f = calledMultipleTimes(a, b);
    return 0;
}
`;

describe("Call Dependencies Checks", () => {
    registerSourceCode(code);

    const hoister = new CallHoisting();

    const canHoistPrintf = Query.search(FunctionJp, { name: "canHoistPrintf" }).first()!;
    const okPrintfCall = Query.searchFrom(canHoistPrintf, Call).first()!;
    const okHoistingRes = hoister.hoist(okPrintfCall);

    it("Hoisting is possible", () => {
        expect(okHoistingRes).toBeTruthy();
    });

    const cannotHoistPrintf = Query.search(FunctionJp, { name: "cannotHoistPrintf" }).first()!;
    const badPrintfCall = Query.searchFrom(cannotHoistPrintf, Call).first()!;
    const badHoistingRes = hoister.hoist(badPrintfCall);

    it("Hoisting is not possible", () => {
        expect(badHoistingRes).toBeFalsy();
    });
});