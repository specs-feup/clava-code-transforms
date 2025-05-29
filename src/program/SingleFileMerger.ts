import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { FileJp, FunctionJp, Include, Statement } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";

export class SingleFileMerger extends AdvancedTransform {

    constructor(silent: boolean = false) {
        super("SingleFileMerger", silent);
    }

    public merge(fileName: string): FileJp {
        const ext = Clava.isCxx() ? "cpp" : "c";
        const fullFileName = `${fileName}.${ext}`;
        const newFile = ClavaJoinPoints.file(fullFileName);

        this.addIncludes(newFile);

        const allFunctions = Query.search(FunctionJp, { isImplementation: true });
        for (const func of allFunctions) {
            const stmt = this.generateDecl(func);
            newFile.insertEnd(stmt);
        }

        Clava.getProgram().addFile(newFile);
        return newFile;
    }

    private generateDecl(func: FunctionJp): Statement {
        const decl = func.getDeclaration(true);
        return ClavaJoinPoints.stmtLiteral(`${decl};`)
    }

    private addIncludes(newFile: FileJp): void {
        for (const file of Query.search(FileJp)) {
            for (const include of file.includes) {
                const name = include.name;
                const isAngled = include.isAngled;
                newFile.addInclude(name, isAngled);
            }
        }
    }
}