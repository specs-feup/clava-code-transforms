import Clava from "@specs-feup/clava/api/clava/Clava.js";
import { Call, FunctionJp, PointerType, TagType, Type, TypedefType } from "@specs-feup/clava/api/Joinpoints.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";
import chalk from "chalk";

export abstract class AdvancedTransform {
    private transformName: string = "AdvancedTransform";
    private silent: boolean = false;

    constructor(name: string, silent?: boolean) {
        this.transformName = name;
        this.silent = silent || false;
    }

    public setSilent(silent: boolean) {
        this.silent = silent;
    }

    public getTransformName(): string {
        return this.transformName;
    }

    protected setTransformName(name: string) {
        this.transformName = name;
    }

    protected simpleType(type: Type, removeSignedInfo: boolean = false): string {
        const baseType = type.code
            .replace("*", "")
            .replace("struct ", "")
            .replace("const ", "")
            .replace("volatile ", "")
            .replace(/\[\d+\]/g, "")    // square brackets
            .trim();

        if (!removeSignedInfo) {
            return baseType;
        }
        return baseType.replace("unsigned", "").replace("signed", "").trim();
    }

    protected log(msg: string, level: "INFO" | "WARN" | "ERROR" = "INFO") {
        if (this.silent && level === "INFO") {
            return;
        }

        const withPrefix = `Transform-${this.transformName}`;
        const header = chalk.magentaBright(withPrefix);
        let levelColoured;
        switch (level) {
            case "INFO":
                levelColoured = "";
                break;
            case "WARN":
                levelColoured = ` ${chalk.yellowBright(level)}:`;
                break;
            case "ERROR":
                levelColoured = ` ${chalk.redBright(level)}:`;
                break;
        }
        const message = `[${header}]${levelColoured} ${msg}`;
        console.log(message);
    }

    protected logWarning(msg: string) {
        this.log(msg, "WARN");
    }

    protected logError(msg: string) {
        this.log(msg, "ERROR");
    }

    protected logLine(len: number = 65) {
        this.log("-".repeat(len));
    }

    protected getFunctionChain(startingPoint: FunctionJp | undefined): FunctionJp[] {
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
        }
        else {
            funs.push(...Query.search(FunctionJp).get().filter(fun => fun.isImplementation));
        }
        return funs;
    }

    protected rebuildAfterTransform(): boolean {
        try {
            Clava.rebuild();
        } catch (e) {
            this.logError(`Error rebuilding code after applying ${this.transformName}`);
            return false;
        }
        this.log(`Rebuild successful after applying ${this.transformName}`);
        return true;
    }

    protected isStructPointer(retVarType: Type) {
        if (retVarType instanceof PointerType) {
            const pointee = retVarType.pointee;
            if (pointee instanceof TypedefType) {
                const baseType = pointee.desugarAll;
                if ((baseType instanceof TagType) && (baseType.decl.code.includes("struct"))) {
                    return true;
                }
            }
        }
        return false;
    }
}