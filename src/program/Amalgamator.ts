import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { Call, FileJp, FunctionJp, Include, Statement, Vardecl } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";

export class Amalgamator extends AdvancedTransform {

    constructor(silent: boolean = false) {
        super("Amalgamator", silent);
    }

    public amalgamate(fileName: string): [FileJp, FileJp[]] {
        const ext = Clava.isCxx() ? "cpp" : "c";
        const fullFileName = `${fileName}.${ext}`;
        const newFile = ClavaJoinPoints.file(fullFileName);
        this.log(`Creating amalgamated file: ${fullFileName}`);

        const userIncludes = this.addIncludes(newFile);
        this.log(`${userIncludes.length} user include files will be added alongside the amalgamated file.`);

        this.addEmptyLine(newFile);
        const signatures = this.addFunctionDecls(newFile);
        this.log(`Added ${signatures.size} function declarations to the amalgamated file.`);

        this.addEmptyLine(newFile);
        const nGlobals = this.addGlobals(newFile);
        this.log(`Added ${nGlobals} global variable declarations to the amalgamated file.`);

        this.addEmptyLine(newFile);
        const nImpls = this.addFunctionImpls(newFile, signatures);
        this.log(`Added ${nImpls} function implementations to the amalgamated file.`);

        Clava.getProgram().addFile(newFile);
        const userIncludesFiles = this.getUserIncludeFiles(userIncludes);

        this.log(`Amalgamation completed in file '${newFile.name}' with ${userIncludesFiles.length} additional user includes`);
        return [newFile, userIncludesFiles];
    }

    public writeAmalgamation(sourceFile: FileJp, outputPath: string, userIncludes: FileJp[] = []): void {
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

    private getAllCalledFunctions(entryPoint: FunctionJp): Set<string> {
        const signatures = new Set<string>();

        for (const call of Query.searchFrom(entryPoint, Call)) {
            const fun = call.function;
            const signature = fun.getDeclaration(true);

            if (fun.isImplementation) {
                signatures.add(signature);
            }
            const childSignatures = this.getAllCalledFunctions(fun);
            childSignatures.forEach(sig => signatures.add(sig));
        }
        return signatures;
    }

    private addFunctionDecls(newFile: FileJp): Set<string> {
        const entryPoint = Query.search(FunctionJp, { name: "main" }).first()!;
        const signatures = this.getAllCalledFunctions(entryPoint);
        signatures.add(entryPoint.getDeclaration(true));

        signatures.forEach(signature => {
            newFile.insertEnd(ClavaJoinPoints.stmtLiteral(`${signature};`));
        });
        return signatures;
    }

    private addGlobals(newFile: FileJp): number {

        const realGlobals: string[] = [];
        const externalGlobals: string[] = [];

        const allGlobals = Query.search(Vardecl, { isGlobal: true });
        for (const global of allGlobals) {
            global.code.startsWith("extern") ?
                externalGlobals.push(global.code.split(" ").slice(1).join(" ")) :
                realGlobals.push(global.code);
        }
        externalGlobals.forEach(global => {
            if (!realGlobals.includes(global)) {
                realGlobals.push(global);
            }
        });
        realGlobals.forEach(global => {
            newFile.insertEnd(ClavaJoinPoints.stmtLiteral(`${global};`));
        });
        return realGlobals.length;
    }

    private addFunctionImpls(newFile: FileJp, signatures: Set<string>): number {
        const uniqueFunctions = new Set<string>();

        for (const file of Query.search(FileJp)) {
            for (const func of Query.searchFrom(file, FunctionJp, { isImplementation: true })) {
                const signature = func.getDeclaration(true);

                if (!uniqueFunctions.has(func.name) && signatures.has(signature)) {
                    const comment = ClavaJoinPoints.comment(`Original file: ${file.name}`);
                    newFile.insertEnd(comment);

                    newFile.insertEnd(func.copy());
                    uniqueFunctions.add(func.name);
                }
            }
        }
        return uniqueFunctions.size;
    }

    private getUserIncludeFiles(userIncludes: string[]): FileJp[] {
        return userIncludes.map(include => {
            const file = Query.search(FileJp, { name: include }).first()!;
            return file;
        });
    }
}