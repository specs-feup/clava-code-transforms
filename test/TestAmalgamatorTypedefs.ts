import Query from "@specs-feup/lara/api/weaver/Query.js";
import { Amalgamator } from "../src/program/Amalgamator.js";
import { FileJp } from "@specs-feup/clava/api/Joinpoints.js";

const amalg = new Amalgamator();

const amalgamatedFileName = "mser";
const [amalgamatedFile, userIncludes] = amalg.amalgamate(amalgamatedFileName);

amalg.writeAmalgamation(amalgamatedFile, "outputs/mser-merged", userIncludes);
amalg.replaceAstWithAmalgamation(amalgamatedFile, userIncludes);

for (const file of Query.search(FileJp)) {
    console.log(`File: ${file.filename}`);
}