import { Call, FunctionJp, Joinpoint } from "@specs-feup/clava/api/Joinpoints.js";
import { AdvancedTransform } from "../AdvancedTransform.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

export abstract class StructFlatteningAlgorithm extends AdvancedTransform {
    constructor(name: string, silent: boolean = false) {
        super(name, silent);
    }

    public abstract decompose(fields: Joinpoint[], structName: string, startingPoint?: FunctionJp): void;

    protected extractFunctionCalls(startingPoint: FunctionJp | undefined): FunctionJp[] {
        const funs: FunctionJp[] = [];

        // if (startingPoint !== undefined) {

        //     const stack = [startingPoint];
        //     const visited = new Set<string>();

        //     while (stack.length > 0) {
        //         const currentFun = stack.pop()!;
        //         if (visited.has(currentFun.name)) {
        //             continue;
        //         }
        //         visited.add(currentFun.name);
        //         funs.push(currentFun);

        //         const calledFuns = Query.searchFrom(currentFun, Call).get()
        //             .map(call => call.function)
        //             .filter(fun => fun != undefined && fun.isImplementation) as FunctionJp[];
        //         stack.push(...calledFuns);
        //     }
        // }
        // else {
        //     funs.push(...Query.search(FunctionJp).get().filter(fun => fun.isImplementation));
        // }
        funs.push(...Query.search(FunctionJp).get());
        return funs;
    }
}
