import { Call } from "@specs-feup/clava/api/Joinpoints.js";
import { Inliner } from "../src/function/Inliner.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

const getCall = (name: string): Call => Query.search(Call, { name: name }).get()[0];

const inliner = new Inliner();
inliner.inline(getCall("iMallocHandle_rep0"));
inliner.inline(getCall("correlateSAD_2D_out0"));
inliner.inline(getCall("padarray4"));
inliner.inline(getCall("computeSAD"));
inliner.inline(getCall("integralImage2D2D"));
inliner.inline(getCall("finalSAD"));
inliner.inline(getCall("iFreeHandle_rep0"));