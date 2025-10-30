import { Call } from "@specs-feup/clava/api/Joinpoints.js";
import { Inliner } from "../src/function/Inliner.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

const inliner = new Inliner();

let call = Query.search(Call, { name: "computeSAD" }).get()[0];
inliner.inline(call);

call = Query.search(Call, { name: "integralImage2D2D" }).get()[0];
inliner.inline(call);

call = Query.search(Call, { name: "iMallocHandle_rep0" }).get()[0];
inliner.inline(call);