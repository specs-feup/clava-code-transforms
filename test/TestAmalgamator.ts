import { Amalgamator } from "../src/program/Amalgamator.js";

const merger = new Amalgamator();

const mergedFileName = "disparity";
const [mergedFile, userIncludes] = merger.merge(mergedFileName);

merger.writeMergedFile(mergedFile, "outputs/disparity-merged", userIncludes);