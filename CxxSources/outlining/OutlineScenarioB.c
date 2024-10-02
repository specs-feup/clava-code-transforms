#include <stdio.h>

#define N 4096

int foo(int A[N], int B[N])
{
    int sum = 0;

    for (int i = 0; i < N; i++)
    {
        sum += A[i] + B[i];
    }
    return sum;
}

void bar(int A[N], int B[N])
{
    for (int i = 0; i < N; i++)
    {
        A[i] += A[i] * B[i];
    }
}

int fizz(int A[N], int B[N])
{
    int sum = 0;

    for (int i = 0; i < N; i++)
    {
        sum += A[i] * B[i];
    }
    return sum;
}

void buzz(int A[N], int B[N])
{
    for (int i = 0; i < N; i++)
    {
        A[i] -= A[i] * B[i];
    }
}

int main()
{
    int A[N] = {[0 ... N - 1] = 10};
    int B[N] = {[0 ... N - 1] = 20};
    int C[N] = {[0 ... N - 1] = 30};
    int D[N] = {[0 ... N - 1] = 40};

    for (int i = 0; i < N; i++)
    {
        A[i] = i * 2;
    }

    int var1 = foo(A, B);

    // Scenario B: extract a set of statements with function calls
    // into their own function

#pragma clava begin_outline

    bar(B, C);
    int var2 = fizz(C, D);
    A[0] = var1;
    A[1] = var2;
    int var3 = foo(A, B);
    buzz(B, D);

#pragma clava end_outline

    // force a use of some variables
    printf("%d\n", var3);

    int sA = 0;
    int sB = 0;
    int sC = 0;
    int sD = 0;

    for (int i = 0; i < N; i++)
    {
        sA += A[i];
        sB += B[i];
        sC += C[i];
        sD += D[i];
    }
    printf("A - Ex: %d, Ac: %d (%s)\n", 38543358, sA, 38543358 == sA ? "SUCCESS" : "FAILURE");
    printf("B - Ex: %d, Ac: %d (%s)\n", -99041280, sB, -99041280 == sB ? "SUCCESS" : "FAILURE");
    printf("C - Ex: %d, Ac: %d (%s)\n", 122880, sC, 122880 == sC ? "SUCCESS" : "FAILURE");
    printf("D - Ex: %d, Ac: %d (%s)\n", 163840, sD, 163840 == sD ? "SUCCESS" : "FAILURE");
    return 0;
}