import Query from "@specs-feup/lara/api/weaver/Query.js";
import { ScopeFlattener } from "../src/flattening/ScopeFlattener.js";
import { FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import VisualizationTool from "@specs-feup/clava-visualization/api/VisualizationTool.js";

const sf = new ScopeFlattener();

for (const fun of Query.search(FunctionJp)) {
    const n = sf.flattenAllInFunction(fun, true, "_scope");
    console.log(`Flattened ${n} scopes in function ${fun.name}`);
}

//await VisualizationTool.visualize();