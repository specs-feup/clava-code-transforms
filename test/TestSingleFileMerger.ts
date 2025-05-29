import { SingleFileMerger } from "../src/program/SingleFileMerger.js";

const appName = "disparity";
const merger = new SingleFileMerger();
const file = merger.merge(appName);
file.write(`outputs/disparity-merged/`);