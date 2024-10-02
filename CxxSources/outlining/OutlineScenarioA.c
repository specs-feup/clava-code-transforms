#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#define N 4096

int globalVar1 = 55;
char globalVar2[100];

int main(int argc, char **argv)
{
    int A[N] = {[0 ... N - 1] = 10};
    int B[N] = {[0 ... N - 1] = 20};
    int C[N] = {[0 ... N - 1] = 30};
    int D[N] = {[0 ... N - 1] = 40};
    int E[N] = {[0 ... N - 1] = 1};

    for (int i = 0; i < N; i++)
    {
        A[i] = i * 2;
    }

    // Scenario A: extract a set of statements with no function calls
    // into their own function
#pragma clava begin_outline
    // this is a comment, that should also be extracted like any other statement

    for (int i = 0; i < N; i++)
    {
        A[i] += B[i] + C[i];
    }

    int sth = 0;
    for (int i = 0; i < N; i++)
    {
        for (int j = 0; j < N; j++)
            C[i] += B[i] + abs(C[j]);
        sth += B[i];
    }
    // a comment in the middle, because why not

    globalVar1 += 61;
    globalVar2[4] = 22;

    int sum = 0;
    for (int i = 0; i < N; i++)
    {
        sum += E[i];
    }

    globalVar1 = globalVar2[5] + globalVar1;

    int prod = 0;
    for (int i = 0; i < N; i++)
    {
        prod *= E[i];
    }
    // and another comment at the end for good measure
#pragma clava end_outline

    // force a use of the "sum" and "sth" variable
    printf("%d\n", sum);
    printf("%d\n", sth);

    int sA = 0;
    int sB = 0;
    int sC = 0;
    int sD = 0;
    int sE = 0;

    for (int i = 0; i < N; i++)
    {
        sA += A[i];
        sB += B[i];
        sC += C[i];
        sD += D[i];
        sE += E[i];
    }
    printf("A - Ex: %d, Ac: %d (%s)\n", 16977920, sA, 16977920 == sA ? "SUCCESS" : "FAILURE");
    printf("B - Ex: %d, Ac: %d (%s)\n", 81920, sB, 81920 == sB ? "SUCCESS" : "FAILURE");
    printf("C - Ex: %d, Ac: %d (%s)\n", -2125316772, sC, -2125316772 == sC ? "SUCCESS" : "FAILURE");
    printf("D - Ex: %d, Ac: %d (%s)\n", 163840, sD, 163840 == sD ? "SUCCESS" : "FAILURE");
    printf("E - Ex: %d, Ac: %d (%s)\n", 4096, sE, 4096 == sE ? "SUCCESS" : "FAILURE");
    return 0;
}

int foo(int *a, int **b, int c[200])
{
    *a = 2;
    return 0;
}