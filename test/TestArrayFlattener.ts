import { ArrayFlattener } from "../src/ArrayFlattener.js";
import { AstDumper } from "./AstDumper.js";

const dumper = new AstDumper();
console.log(dumper.dump());

const arrayFlattener = new ArrayFlattener();
arrayFlattener.flattenAll();
