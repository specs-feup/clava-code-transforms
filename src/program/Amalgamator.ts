import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { FileJp, FunctionJp, Include, Statement, Vardecl } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";

export class Amalgamator extends AdvancedTransform {

    constructor(silent: boolean = false) {
        super("Amalgamator", silent);
    }

    public merge(fileName: string): [FileJp, FileJp[]] {
        const ext = Clava.isCxx() ? "cpp" : "c";
        const fullFileName = `${fileName}.${ext}`;
        const newFile = ClavaJoinPoints.file(fullFileName);

        const userIncludes = this.addIncludes(newFile);

        this.addEmptyLine(newFile);
        this.addFunctionDecls(newFile);

        this.addEmptyLine(newFile);
        this.addGlobals(newFile);

        this.addEmptyLine(newFile);
        this.addFunctionImpls(newFile);

        Clava.getProgram().addFile(newFile);

        const userIncludesFiles = this.getUserIncludeFiles(userIncludes);
        return [newFile, userIncludesFiles];
    }

    public writeMergedFile(sourceFile: FileJp, outputPath: string, userIncludes: FileJp[] = []): void {
        sourceFile.write(outputPath);

        for (const includeFile of userIncludes) {
            includeFile.write(outputPath);
        }
    }

    private addEmptyLine(newFile: FileJp): void {
        const emptyLine: Statement = ClavaJoinPoints.stmtLiteral("");
        newFile.insertEnd(emptyLine);
    }

    private addIncludes(newFile: FileJp): string[] {
        const systemIncludes = new Set<string>();
        const userIncludes = new Set<string>();

        for (const file of Query.search(FileJp)) {
            for (const include of file.includes) {
                const name = include.name;

                if (include.isAngled) {
                    systemIncludes.add(name);
                } else {
                    userIncludes.add(name);
                }
            }
        }

        for (const include of systemIncludes) {
            newFile.addInclude(include, true);
        }

        for (const include of userIncludes) {
            newFile.addInclude(include, false);
        }
        return Array.from(userIncludes);
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
        const uniqueFunctions = new Set<string>();

        for (const file of Query.search(FileJp)) {
            const comment = ClavaJoinPoints.comment(`Original file: ${file.name}`);
            newFile.insertEnd(comment);

            for (const func of Query.searchFrom(file, FunctionJp, { isImplementation: true })) {
                if (!uniqueFunctions.has(func.name)) {
                    newFile.insertEnd(func.copy());
                    uniqueFunctions.add(func.name);
                } else {
                    this.logWarning(`Found a duplicate function implementation of '${func.name}' in file '${file.name}'. It will be ignored.`);
                }
            }
        }
    }

    private getUserIncludeFiles(userIncludes: string[]): FileJp[] {
        return userIncludes.map(include => {
            const file = Query.search(FileJp, { name: include }).first()!;
            return file;
        });
    }
}