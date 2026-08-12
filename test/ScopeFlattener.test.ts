import { FunctionJp, Scope, Vardecl } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { ScopeFlattener } from "../src/flattening/ScopeFlattener.js";
import { registerSourceCodeEach } from "./jestHelpers.js";

const source = `
int calculate(void) {
    int value = 1;
    {
        int value = 2;
        value++;
    }
    return value;
}
`;

describe("scope flattening", () => {
    registerSourceCodeEach(source);

    test("removes redundant scopes and preserves unique variable names", () => {
        const fun = Query.search(FunctionJp, { name: "calculate" }).first()!;
        const flattener = new ScopeFlattener(true);
        const redundantScopes = () => Query.searchFrom(fun.body, Scope)
            .get()
            .filter(scope => flattener.isRedundant(scope));

        expect(redundantScopes()).toHaveLength(1);
        expect(flattener.flattenAllInFunction(fun, true, "test_scope")).toBe(1);
        expect(redundantScopes()).toHaveLength(0);

        const names = Query.searchFrom(fun, Vardecl).get().map(decl => decl.name);
        expect(new Set(names).size).toBe(names.length);
        expect(names).toContain("value");
        expect(names.some(name => name.includes("test_scope"))).toBe(true);
    });
});
