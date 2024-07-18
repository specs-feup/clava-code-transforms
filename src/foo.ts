import { FunctionJp } from "clava-js/api/Joinpoints.js";
import Query from "lara-js/api/weaver/Query.js";

export function foo() {
    return Query.search(FunctionJp).get().length;
};
