import { FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { LightStructFlattener } from "../src/flattening/LightStructFlattener.js";
import { StructFlattener } from "../src/flattening/StructFlattener.js";
import { AstDumper } from "./AstDumper.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

const dumper = new AstDumper();
//console.log(dumper.dump());

const startingPoint = Query.search(FunctionJp, { name: "getDisparity" }).get().filter(fun => fun.isImplementation)[0];
const decomp = new StructFlattener(new LightStructFlattener());
decomp.flattenAll(startingPoint);