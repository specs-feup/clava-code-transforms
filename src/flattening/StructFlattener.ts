import { Class, FileJp, Joinpoint, Struct, TypedefDecl } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import { LegacyStructFlattener } from "./LegacyStructFlattener.js";

export class StructFlattener extends AdvancedTransform {
    private algorithm: StructFlatteningAlgorithm;

    constructor(algorithm: StructFlatteningAlgorithm = new LegacyStructFlattener(), silent: boolean = false) {
        super("StructFlattener", silent);
        this.algorithm = algorithm;
        algorithm.setSilent(silent);
    }

    public flattenAll(): string[] {
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
            this.algorithm.decompose(struct.fields, name);
            decompNames.push(name);
            this.log(`Done flattening struct ${name}`);
        });
        this.log(`Total flattened structs: ${decompNames.length}`);

        return decompNames;
    }

    public flattenByName(name: string): void {
        const structs = [
            ...this.findAllStructs(),
            ...this.findAllStructlikeClasses()
        ];
        structs.forEach((elem) => {
            const elemName = elem[0];
            const elemStruct = elem[1];

            if (elemName === name) {
                this.algorithm.decompose(elemStruct.fields, name);
            }
        });
    }

    public flattenStruct(struct: Struct): void {
        const name = this.getStructName(struct);
        this.algorithm.decompose(struct.fields, name);
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

export abstract class StructFlatteningAlgorithm extends AdvancedTransform {
    constructor(name: string, silent: boolean = false) {
        super(name, silent);
    }

    public abstract decompose(fields: Joinpoint[], structName: string): void;
}