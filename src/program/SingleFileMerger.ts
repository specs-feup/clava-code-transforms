import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { FileJp, FunctionJp, Include, Statement, Vardecl } from "@specs-feup/clava/api/Joinpoints.js";
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

        this.addFunctionDecls(newFile);

        this.addGlobals(newFile);

        this.addFunctionImpls(newFile);

        Clava.getProgram().addFile(newFile);
        return newFile;
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

    private addFunctionDecls(newFile: FileJp): void {
        const allFunctions = Query.search(FunctionJp, { isImplementation: true });
        for (const func of allFunctions) {
            const decl = func.getDeclaration(true);
            newFile.insertEnd(ClavaJoinPoints.stmtLiteral(`${decl};`));
        }
    }

    private addGlobals(newFile: FileJp): void {
        const allGlobals = Query.search(Vardecl, { isGlobal: true });
        for (const global of allGlobals) {
            newFile.insertEnd(global.copy());
        }
    }

    private addFunctionImpls(newFile: FileJp): void {
        const allFunctions = Query.search(FunctionJp, { isImplementation: true });
        for (const func of allFunctions) {
            newFile.insertEnd(func.copy());
        }
    }
}