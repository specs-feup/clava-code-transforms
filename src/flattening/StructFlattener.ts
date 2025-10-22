import { Call, Class, FileJp, FunctionJp, Joinpoint, Struct, TypedefDecl } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import { LegacyStructFlattener } from "./legacy/LegacyStructFlattener.js";
import { StructFlatteningAlgorithm } from "./StructFlatteningAlgorithm.js";
import Clava from "@specs-feup/clava/api/clava/Clava.js";

export class StructFlattener extends AdvancedTransform {
    private algorithm: StructFlatteningAlgorithm;

    constructor(algorithm: StructFlatteningAlgorithm = new LegacyStructFlattener(), silent: boolean = false) {
        super("StructFlattener", silent);
        this.algorithm = algorithm;
        this.algorithm.setSilent(silent);
    }

    public flattenAll(startingPoint?: FunctionJp): string[] {
        const funs = this.extractFunctionCalls(startingPoint);
        const structs = this.findAllStructs();
        this.log(`Found ${structs.length} regular structs`);

        const classes = this.findAllStructlikeClasses();
        this.log(`Found ${classes.length} structs aliased as classes`);

        const totalStructs = [
            ...structs,
            ...classes
        ];
        const decompNames: string[] = [];

        totalStructs.forEach(([name, struct]) => {
            this.log(`Flattening struct ${name}`);

            this.algorithm.flatten(struct.fields, name, funs);
            decompNames.push(name);
            this.log(`Done flattening struct ${name}`);
        });
        this.log(`Total flattened structs: ${decompNames.length}`);

        return decompNames;
    }

    public flattenByName(name: string, startingPoint?: FunctionJp): void {
        const funs = this.extractFunctionCalls(startingPoint);
        const structs = [
            ...this.findAllStructs(),
            ...this.findAllStructlikeClasses()
        ];
        structs.forEach((elem) => {
            const elemName = elem[0];
            const elemStruct = elem[1];

            if (elemName === name) {

                this.algorithm.flatten(elemStruct.fields, name, funs);
            }
        });
    }

    public flattenStruct(struct: Struct, startingPoint?: FunctionJp): void {
        const name = this.getStructName(struct);
        const funs = this.extractFunctionCalls(startingPoint);
        this.algorithm.flatten(struct.fields, name, funs);
    }

    // -----------------------------------------------------------------------
    protected extractFunctionCalls(startingPoint: FunctionJp | undefined): FunctionJp[] {
        const funs: FunctionJp[] = [];

        if (startingPoint !== undefined) {

            const stack = [startingPoint];
            const visited = new Set<string>();

            while (stack.length > 0) {
                const currentFun = stack.pop()!;
                if (visited.has(currentFun.name)) {
                    continue;
                }
                visited.add(currentFun.name);
                funs.push(currentFun);

                const calledFuns = Query.searchFrom(currentFun, Call).get()
                    .map(call => call.function)
                    .filter(fun => fun != undefined && fun.isImplementation) as FunctionJp[];
                stack.push(...calledFuns);
            }
            this.log(`Found ${funs.length} functions reachable from ${startingPoint.name}`);
        }
        else {
            funs.push(...Query.search(FunctionJp).get().filter(fun => fun.isImplementation));
            this.log(`Found ${funs.length} functions in the codebase`);
        }
        return funs;
    }

    // -----------------------------------------------------------------------
    private findAllStructs(): [string, Struct][] {
        const structs: [string, Struct][] = [];

        for (const struct of Query.search(Struct)) {
            const name = this.getStructName(struct);
            structs.push([name, struct]);
        }
        return structs;
    }

    private findAllStructlikeClasses(): [string, Class][] {
        const classes: Map<string, Class> = new Map();

        for (const file of Query.search(FileJp)) {
            for (const stmt of file.children) {
                if (stmt instanceof Class) {
                    const classJp = stmt as Class;
                    let name = classJp.name;

                    let isStruct = false;
                    for (const typedef of Query.searchFrom(classJp, TypedefDecl)) {
                        if (typedef.type.code.trim() == "struct") {
                            isStruct = true;
                            name = typedef.name;
                        }
                    }

                    if (isStruct) {
                        classes.set(name, classJp);
                    }
                }
            }
        }
        return Array.from(classes);
    }

    public getStructName(struct: Struct): string {
        let name: string = struct.name;

        // typedef struct { ... } typedef_name;
        if (struct.name === "") {
            const jp: Joinpoint = struct.children[struct.children.length - 1].children[0];
            const typedef = jp as TypedefDecl;
            name = typedef.name;
        }
        return name;
    }
}

