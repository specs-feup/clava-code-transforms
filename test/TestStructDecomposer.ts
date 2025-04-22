import { StructFlattener } from "../src/flattening/StructDecomposer.js";
import { AstDumper } from "./AstDumper.js";

const dumper = new AstDumper();
console.log(dumper.dump());

const decomp = new StructFlattener();
decomp.decomposeAll();