laraImport("weaver.Query");
laraImport("clava.ClavaJoinPoints");

class ConstantPropagator {
    constructor() { }

    doPassesUntilStop(maxPasses = 99) {
        let passes = 1;
        let hasChanged = this.doPass();

        while (hasChanged && passes < maxPasses) {
            hasChanged = this.doPass();
            passes++;
        }
        return passes;
    }

    doPass() {
        // for cases where a varref refers to a global like "const int foo = 10;"
        for (const varref of Query.search("varref")) {
            if (varref.hasOwnProperty("vardecl") && varref.vardecl != null) {
                if (varref.vardecl.isGlobal && varref.vardecl.hasInit) {
                    this.#propagateConstantGlobal(varref);
                }
            }
        }
        // for cases where a varref refers to a parameter or vardecl in a function
        for (const fun of Query.search("function")) {
            this.#propagateInFunction(fun);
        }

        return false;
    }

    #propagateConstantGlobal(varref) {
        const decl = varref.vardecl;
        const type = decl.type.code;
        const isConst = type.split(" ").includes("const");

        if (isConst) {
            const init = varref.vardecl.init;
            if (init.instanceOf("intLiteral")) {
                const value = init.value;
                const newLiteral = ClavaJoinPoints.integerLiteral(value);
                varref.replaceWith(newLiteral);
            }
            if (init.instanceOf("floatLiteral")) {
                const value = init.value;
                const newLiteral = ClavaJoinPoints.doubleLiteral(value);
                varref.replaceWith(newLiteral);
            }
        }
    }

    #propagateInFunction(fun) {
        const allDefs = [];
        for (const decl of Query.searchFrom(fun, "vardecl")) {
            allDefs.push(decl);
        }
        for (const param of Query.searchFrom(fun, "param")) {
            allDefs.push(param);
        }

        for (const def of allDefs) {
            const refChain = this.#findRefChain(def, fun);
            this.#propagateChain(refChain);
        }
    }

    #findRefChain(def, fun) {
        const name = def.name;
        const refChain = [];

        for (const ref of Query.searchFrom(fun, "varref", { name: name })) {
            refChain.push(ref);
        }
        return refChain;
    }

    #propagateChain(refChain) {
        //println(refChain.length);
    }
}