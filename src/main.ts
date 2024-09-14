import Query from "lara-js/api/weaver/Query.js";
import IdGenerator from "lara-js/api/lara/util/IdGenerator.js"
import { FunctionJp } from "clava-js/api/Joinpoints.js";
import { foo } from "./foo.js";

for (const $function of Query.search(FunctionJp)) {
    console.log($function.name);
}

console.log(IdGenerator.next("hello"));
console.log("Done");
console.log("Also, foo =", foo());
