import { Call, Class, FileJp, FunctionJp, Joinpoint, Struct, TypedefDecl } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import { LegacyStructFlattener } from "./legacy/LegacyStructFlattener.js";
import { StructFlatteningAlgorithm } from "./StructFlatteningAlgorithm.js";

export class StructFlattener extends AdvancedTransform {
    private algorithm: StructFlatteningAlgorithm;

    constructor(algorithm: StructFlatteningAlgorithm = new LegacyStructFlattener(), silent: boolean = false) {
        super("StructFlattener", silent);
        this.algorithm = algorithm;
        this.algorithm.setSilent(silent);
    }

    public flattenAll(startingPoint?: FunctionJp): string[] {
        const funs = this.getFunctionChain(startingPoint);

        const structs = this.findAllStructs();
        this.log(`Found ${structs.length} regular structs`);

        const classes = this.findAllStructlikeClasses();
        this.log(`Found ${classes.length} structs aliased as classes`);

        const totalStructs = [
            ...structs,
            ...classes
        ].sort((s1, s2) => {
            const s1Name = s1[0];
            const s2Name = s2[0];
            return s1Name.localeCompare(s2Name);
        });

        const decompNames: string[] = [];

        totalStructs.forEach(([name, struct]) => {
            this.log(`Flattening struct ${name}`);

            this.algorithm.flatten(struct.fields, name, funs);
            decompNames.push(name);
            this.log(`Done flattening struct ${name}`);
        });
        this.log(`Total flattened structs: ${decompNames.length}`);

        this.rebuildAfterTransform();

        return decompNames;
    }

    public flattenByName(name: string, startingPoint?: FunctionJp): boolean {
        const funs = this.getFunctionChain(startingPoint);
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
        return this.rebuildAfterTransform();
    }

    public flattenStruct(struct: Struct, startingPoint?: FunctionJp): boolean {
        const name = this.getStructName(struct);
        const funs = this.getFunctionChain(startingPoint);
        this.algorithm.flatten(struct.fields, name, funs);

        return this.rebuildAfterTransform();
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

