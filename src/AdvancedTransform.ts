import { Type } from "@specs-feup/clava/api/Joinpoints.js";
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
}