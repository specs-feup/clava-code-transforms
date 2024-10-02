#include <stdio.h>

int noimplementation(int A, int B);

int foo(int A, int B, int C)
{
    A = B + C;
    A = A * 2;
    return A;
}

void bar(int A, int B, int *C)
{
    A = B + *C;
    A = A * 2;
    *C = A;
}

int fizz(int A[100], int B[100])
{
    for (int i = 0; i < 100; i++)
    {
        A[i] = B[i];
        if (A[i] == 0)
        {
            return B[i];
        }
    }
    return A[0];
}

float buzz(int *A, double *B, char C[])
{
    for (int i = 0; i < 100; i++)
    {
        C[i] = 0;
    }
    int *X;
    for (int i = 0; i < 100; i++)
    {
        C[i] = C[i] + 1;
        for (int j = 0; j < 100; j++)
        {
            if (C[i] > 0)
                return 0.3;
            C[j] = C[j] + 2;
            for (int k = 0; k < 100; k++)
            {
                C[k] = C[k] + 3;
                if (C[k] > 0)
                {

                    return 0.4;
                }
                for (int l = 0; l < 100; l++)
                {
                    C[l] = C[l] + 4;
                }
            }
        }
    }
    return 0.6;
}

int hasDefaultStuff(int a, int b, int c = 2354, int d = 124154)
{
    a = a + b;
    b = a + c + d;
    c += a;
    int res = a + b + c;
    return res;
}

int main()
{
    int A = 0;
    int B = 0;
    int X = foo(A, B, 51);
    int Y = X + foo(A, B, 52) + A;
    int num = 14;

    int someRes1 = hasDefaultStuff(A, B);
    int someRes2 = hasDefaultStuff(A, B, 555);
    int someRes3 = hasDefaultStuff(A, B, 666, 777);

    bar(A, B, &X);

    int A1[100];
    int B1[100];
    A = fizz(A1, B1);
    B = A + fizz(A1, B1) + A1[0];
    A1[2] = fizz(A1, B1);

    char C[100];
    double U = 14515.5;
    float V = buzz(A1, &U, C) + buzz(A1, &U, C) + buzz(A1, &U, C);
    return 0;
}