import Query from "@specs-feup/lara/api/weaver/Query.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js"
import { Decl, FloatLiteral, FunctionJp, IntLiteral, Param, Vardecl, Varref } from "@specs-feup/clava/api/Joinpoints.js"

export default class ConstantPropagator {
    constructor() { }

    doPassesUntilStop(maxPasses = 99): number {
        let passes = 1;
        let hasChanged = this.doPass();

        while (hasChanged && passes < maxPasses) {
            hasChanged = this.doPass();
            passes++;
        }
        return passes;
    }

    doPass(): boolean {
        // for cases where a varref refers to a global like "const int foo = 10;"
        for (const varref of Query.search(Varref)) {

            if (varref.hasOwnProperty("vardecl") && varref.vardecl != null) {
                if (varref.vardecl.isGlobal && varref.vardecl.hasInit) {
                    this.#propagateConstantGlobal(varref);
                }
            }
        }
        // for cases where a varref refers to a parameter or vardecl in a function
        for (const fun of Query.search(FunctionJp)) {
            this.#propagateInFunction(fun);
        }

        return false;
    }

    #propagateConstantGlobal(varref: Varref) {
        const decl = varref.vardecl;
        const type = decl.type.code;
        const isConst = type.split(" ").includes("const");

        if (isConst) {
            const init = varref.vardecl.init;
            if (init instanceof IntLiteral) {
                const value = init.value;
                const newLiteral = ClavaJoinPoints.integerLiteral(value);
                varref.replaceWith(newLiteral);
            }
            if (init instanceof FloatLiteral) {
                const value = init.value;
                const newLiteral = ClavaJoinPoints.doubleLiteral(value);
                varref.replaceWith(newLiteral);
            }
        }
    }

    #propagateInFunction(fun: FunctionJp) {
        const allDecls: Vardecl[] = [];
        const allParams: Param[] = [];

        for (const decl of Query.searchFrom(fun, Vardecl)) {
            allDecls.push(decl);
        }
        for (const param of Query.searchFrom(fun, Param)) {
            allParams.push(param);
        }

        for (const def of allDecls) {
            const refChain = this.#findRefChain(def, fun);
            this.#propagateChain(refChain);
        }
        for (const param of allParams) {
            const refChain = this.#findRefChain(param, fun);
            this.#propagateChain(refChain);
        }
    }

    #findRefChain(def: Vardecl | Param, fun: FunctionJp): Varref[] {
        const name = def.name;
        const refChain: Varref[] = [];

        for (const ref of Query.searchFrom(fun, Varref, { name: name })) {
            refChain.push(ref);
        }
        return refChain;
    }

    #propagateChain(refChain: Varref[]) {
        //println(refChain.length);
    }
}