import { Switch } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "./AdvancedTransform.js";

export class SwitchToIf extends AdvancedTransform {
    constructor(silent: boolean = false) {
        super("SwitchToIf", silent);
    }

    public convert(sw: Switch): boolean {
        this.logWarning("Switch-toIf conversion not implemented yet");
        return false;
    }
}