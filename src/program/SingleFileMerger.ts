import Clava from "@specs-feup/clava/api/clava/Clava.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { FileJp, Include } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AdvancedTransform } from "../AdvancedTransform.js";

export class SingleFileMerger extends AdvancedTransform {

    constructor(silent: boolean = false) {
        super("SingleFileMerger", silent);
    }

    public merge(fileName: string): FileJp {
        const newFile = ClavaJoinPoints.file(fileName);

        this.addIncludes(newFile);


        //Clava.getProgram().addFile(newFile);
        newFile.write("outputs");
        return newFile;
    }

    private addIncludes(file: FileJp): void {
        for (const include of Query.search(Include)) {
            file.addIncludeJp(include);
        }
    }
}