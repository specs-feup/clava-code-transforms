import { Call, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { MallocHoister } from "../src/hoisting/MallocHoister.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";

const targetPoint = Query.search(FunctionJp, (f) => f.name === "getDisparity" && f.isImplementation).first() as FunctionJp;

const mallocHoister = new MallocHoister();
const n = mallocHoister.hoistAllMallocs(targetPoint);
console.log(`Number of mallocs hoisted: ${n}`);