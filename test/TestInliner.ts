import { Call } from "@specs-feup/clava/api/Joinpoints.js";
import { Inliner } from "../src/function/Inliner.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

const call = Query.search(Call, { name: "computeSAD" }).get()[0];

const inliner = new Inliner();
inliner.inline(call);