import Clava from "@specs-feup/clava/api/clava/Clava.js";
import ClavaJoinPoints from "@specs-feup/clava/api/clava/ClavaJoinPoints.js";
import { LaraJoinPoint } from "@specs-feup/lara/api/LaraJoinPoint.js";
import { Filter_WrapperVariant } from "@specs-feup/lara/api/weaver/Selector.js";
import Query from "@specs-feup/lara/api/weaver/Query.js";

/**
 * Duplicated from @specs-feup/lara/jest because of weird errors when importing from there...
 * 
 * Registers the source code that will be used by the weaver for the purpose of this test suite.
 *
 * @param code - String containing the source code.
 */
export function registerSourceCode(code: string): void {
  beforeAll(() => {
    Clava.getProgram().push();
    const program = Clava.getProgram();
    const sourceFile = ClavaJoinPoints.fileWithSource("dummyFile.cpp", code);
    program.addFile(sourceFile);
    program.rebuild();
  });

  afterAll(() => {
    Clava.getProgram().pop();
  });
}

/**
 * In contrast to registerSourceCode, the AST is rebuilt before each test
 *
 * @param code - String containing the source code.
 */
export function registerSourceCodeEach(code: string): void {
  beforeEach(() => {
    Clava.getProgram().push();
    const program = Clava.getProgram();
    const sourceFile = ClavaJoinPoints.fileWithSource("dummyFile.cpp", code);
    program.addFile(sourceFile);
    program.rebuild();
  });

  afterEach(() => {
    Clava.getProgram().pop();
  });
}

/**
 * In contrast to registerSourceCode, this simply pushes the AST onto the stack
 * and then loads the code. It is up to the user to pop the AST after they're done
 * with it
 */
export function registerSourceCodeOnce(code: string): void {
    Clava.getProgram().push();
    const program = Clava.getProgram();
    const sourceFile = ClavaJoinPoints.fileWithSource("dummyFile.cpp", code);
    program.addFile(sourceFile);
    program.rebuild();
}

export function getFirstAndExpectExists<T extends typeof LaraJoinPoint>(
    type: T,
    filter?: Filter_WrapperVariant<T>
): InstanceType<T> {
    const jp = Query.search(type, filter).getFirst();

    return expectExists(jp);
}

export function expectExists<LaraJoinPoint>(jp: LaraJoinPoint | undefined): LaraJoinPoint {
    expect(jp).toBeDefined();
    expect(jp).not.toBeNull();

    return jp!;
}