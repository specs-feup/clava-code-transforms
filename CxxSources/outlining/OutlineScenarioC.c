#include <stdio.h>
#include <stdlib.h>
#include <math.h>

#define N 128

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

    // this is a comment, that should also be extracted like any other statement

    for (int a = 0; a < N; a++)
    {
        for (int j = 0; j < N; j++)
        {
            A[j] += B[j] + C[j];
            for (int i = 0; i < N; i++)
            {
                A[i] += B[i] + C[i];
            }
        }

        for (int b = 0; b < N; b++)
        {
            A[2] = b;
#pragma clava begin_outline
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
#pragma clava end_outline
            // and another comment at the end for good measure
        }
        globalVar1 += 61;
        globalVar2[4] = 22;

        int sum = 0;
        for (int i = 0; i < N; i++)
        {
            sum += E[i];
        }
    }

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
    printf("A - Ex: %d, Ac: %d (%s)\n", -2063178893, sA, -2063178893 == sA ? "SUCCESS" : "FAILURE");
    printf("B - Ex: %d, Ac: %d (%s)\n", 2560, sB, 2560 == sB ? "SUCCESS" : "FAILURE");
    printf("C - Ex: %d, Ac: %d (%s)\n", -1645539688, sC, -1645539688 == sC ? "SUCCESS" : "FAILURE");
    printf("D - Ex: %d, Ac: %d (%s)\n", 5120, sD, 5120 == sD ? "SUCCESS" : "FAILURE");
    printf("E - Ex: %d, Ac: %d (%s)\n", 128, sE, 128 == sE ? "SUCCESS" : "FAILURE");
    return 0;
}

int foo(int *a, int **b, int c[200])
{
    *a = 2;
    return 0;
}