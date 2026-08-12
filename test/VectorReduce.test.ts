import { registerSourceCodeEach, registerSourceCode, registerSourceCodeOnce } from './jestHelpers.js';
import { VectorReduceSimplificator } from '../src/vectorreduce/VectorReduceSimplification.js';
import fs from "node:fs";
import { execFileSync } from 'node:child_process';
import { Joinpoint } from '@specs-feup/clava/api/Joinpoints.js';
import Query from '@specs-feup/lara/api/weaver/Query.js';
import Clava from '@specs-feup/clava/api/clava/Clava.js';
import path, { ParsedPath } from 'node:path';

// const simpleCompleteCode = fs.readFileSync("./inputs/vectorreduce/SimpleComplete.c", "utf-8");
// const simplePartialCode = fs.readFileSync("./inputs/vectorreduce/SimplePartial.c", "utf-8");

function execFileSyncOrFail(filePath: string, args: string[], errorMessagePreface: string, timeout: number): string {
    try {
        const stdout: string = execFileSync(filePath, args, { encoding: "utf-8", timeout });
        return stdout;
    } catch (e) {
        throw new Error(`${errorMessagePreface} ${e}`);
    }
}

function assertGccExists(): void {
    execFileSyncOrFail('gcc', ['--version'], 'GCC not found: ', 10_000);
}

function removeIfExists(filePath: string) {
    if (fs.existsSync(filePath)) {
        try {
            fs.rmSync(filePath);
        } catch (_) { }
    }
}

function removeDirIfExists(dirPath: string) {
    if (fs.existsSync(dirPath)) {
        try {
            fs.rmSync(dirPath, { recursive: true });
        } catch (_) { }
    }
}

class CodeRunner {
    private inputFolderPath: string;
    private outputFolderPath: string;
    private callback: () => void;

    /**
     * 
     * @param inputFolderPath directory where the input files should be searched in
     * @param callback function used to modify the content of the AST so as to produce the modified file
     * @param outputFolderPath <default: ./dist> path to the directory in which the intermediate files will be output to
     */
    constructor(inputFolderPath: string, callback: () => void, outputFolderPath?: string) {
        this.inputFolderPath = inputFolderPath;
        this.callback = callback;
        this.outputFolderPath = outputFolderPath ?? "./dist/woven_code/";
    }

    /**
     * 
     * @param fileName name of the file to be used as input for the test. Will be joined to inputFolderPath
     * @param compileTimeout <default: 30000> timeout for compiling programs in milliseconds
     * @param runTimeout <default: 5000> timeout for running the compiled programs in milliseconds
     */
    public test(testName: string,
        fileNames: string[],
        verificationCallback: (stdoutOriginal: string, stdoutModified: string) => boolean = (stdoutOriginal: string, stdoutModified: string) => stdoutOriginal === stdoutModified,
        compileTimeout: number = 30_000, runTimeout: number = 5_000) {
        const originalInputFilePaths: string[] = fileNames.map(fn => path.join(this.inputFolderPath, fn));

        const clavaOutputFilePaths: string[] = fileNames.map(fn => path.join(this.outputFolderPath, testName, fn));

        const compiledOriginalPath: string = path.join(this.outputFolderPath, testName, "original-elf");
        const compiledModifiedPath: string = path.join(this.outputFolderPath, testName, "modified-elf");

        removeDirIfExists(path.join(this.outputFolderPath, testName));
        removeIfExists(compiledOriginalPath);
        removeIfExists(compiledModifiedPath);

        for (const inputFile of originalInputFilePaths) {
            if (!fs.existsSync(inputFile)) {
                throw new Error(`Could not find input file (path: «${inputFile}»)`);
            }
        }

        assertGccExists();

        Clava.pushAst();

        for (const inputFile of originalInputFilePaths) {
            try {
                Clava.addExistingFile(inputFile);
                Clava.rebuild();
            } catch (e) {
                Clava.popAst();
                throw new Error(`Could not parse input file:\n${e}`);
            }
        }

        try {
            this.callback();
        } catch (e) {
            Clava.popAst();
            throw new Error(`Could not execute the callback:\n${e}`);
        }

        try {
            Clava.writeCode(path.join(this.outputFolderPath, testName));
        } catch (e) {
            Clava.popAst();
            throw new Error(`Could not output code:\n${e}`);
        }

        Clava.popAst();

        for (const ofPath of clavaOutputFilePaths) {
            if (!fs.existsSync(ofPath)) {
                throw new Error(`Could not find the file that should have been written by clava (expected at «${ofPath}»)`);
            }

        }

        execFileSyncOrFail('gcc', ['-o', compiledOriginalPath, ...originalInputFilePaths], 'Failed to compile original program: ', compileTimeout);
        execFileSyncOrFail('gcc', ['-o', compiledModifiedPath, ...clavaOutputFilePaths], 'Failed to compile modified program: ', compileTimeout);

        const originalProgramStdout: string = execFileSyncOrFail(compiledOriginalPath, [], 'Error running compiled original program: ', runTimeout);
        const modifiedProgramStdout: string = execFileSyncOrFail(compiledModifiedPath, [], 'Error running compiled modified program: ', runTimeout);

        if (!verificationCallback(originalProgramStdout, modifiedProgramStdout)) {
            throw new Error(`Verification failed.\nOriginal program stdout:\n${originalProgramStdout}\n\nModified program stdout:\n${modifiedProgramStdout}`);
        }

        console.log(`Original program stdout:\n${originalProgramStdout}\n\nModified program stdout:\n${modifiedProgramStdout}`);
    }
}
/*
describe("simple complete", () => {
    console.log(simpleCompleteCode);
    registerSourceCode(simpleCompleteCode);

    test("simple complete finds one opportunity", () => {
        const vrs: VectorReduceSimplificator = new VectorReduceSimplificator(false);
        const res = vrs.simplify();
        expect(res).toBe(1);

        // console.log((Query.root() as Joinpoint).code);
    });
});

describe("simple partial", () => {
    console.log(simplePartialCode);
    registerSourceCode(simplePartialCode);

    test("simple partial finds one opportunity", () => {
        const vrs: VectorReduceSimplificator = new VectorReduceSimplificator(false);
        const res = vrs.simplify();
        expect(res).toBe(1);

        // console.log((Query.root() as Joinpoint).code);
    });
});
*/

const codeRunner: CodeRunner = new CodeRunner("./inputs/vectorreduce/", () => {
    const vrs: VectorReduceSimplificator = new VectorReduceSimplificator(false);
    vrs.simplify();
});

test("simple complete has equal output", () => {
    codeRunner.test("simpleComplete", ["SimpleComplete.c"]);
}, 90_000);

test("simple partial has equal output", () => {
    codeRunner.test("simplePartial", ["SimplePartial.c"]);
}, 90_000);
