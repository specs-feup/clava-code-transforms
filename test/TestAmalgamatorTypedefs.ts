import { Amalgamator } from "../src/program/Amalgamator.js";

const amalg = new Amalgamator();

const amalgamatedFileName = "mser";
const [amalgamatedFile, userIncludes] = amalg.amalgamate(amalgamatedFileName);

amalg.writeAmalgamation(amalgamatedFile, "outputs/mser-merged", userIncludes);