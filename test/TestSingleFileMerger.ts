import { SingleFileMerger } from "../src/program/SingleFileMerger.js";

const appName = "disparity";
const merger = new SingleFileMerger();
const files = merger.merge(appName);

merger.writeMergedFile(files[0], "outputs/disparity-merged", files[1]);