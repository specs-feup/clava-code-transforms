import { SingleFileMerger } from "../src/program/SingleFileMerger.js";

const merger = new SingleFileMerger();

const mergedFileName = "disparity";
const [mergedFile, userIncludes] = merger.merge(mergedFileName);

merger.writeMergedFile(mergedFile, "outputs/disparity-merged", userIncludes);