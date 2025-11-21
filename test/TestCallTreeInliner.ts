import { Call, FunctionJp } from "@specs-feup/clava/api/Joinpoints.js";
import { CallTreeInliner } from "../src/function/CallTreeInliner.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

const topFunName = "getDisparity";
const topFun = Query.search(FunctionJp, (f) => f.name == topFunName && f.isImplementation).get()[0];

const callTreeInliner = new CallTreeInliner();
callTreeInliner.inlineCallTree(topFun, true);