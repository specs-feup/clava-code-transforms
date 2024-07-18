import Query from "lara-js/api/weaver/Query.js";
import { FunctionJp } from "clava-js/api/Joinpoints.js";
import { foo } from "./foo.js";

for (const $function of Query.search(FunctionJp)) {
    console.log($function.name);
}


console.log("Done");
console.log("Also, foo =", foo());