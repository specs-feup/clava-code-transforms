import { Amalgamator } from "../src/program/Amalgamator.js";

const amalg = new Amalgamator();

const amalgamatedFileName = "disparity";
const [amalgamatedFile, userIncludes] = amalg.amalgamate(amalgamatedFileName);

amalg.writeAmalgamation(amalgamatedFile, "outputs/disparity-merged", userIncludes);