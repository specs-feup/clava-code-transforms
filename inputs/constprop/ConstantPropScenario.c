#include <stdio.h>

int globalO;
const int globalN = 55;
int globalM = 16;
const int globalL = 55 * 16;
int globalK = 880 * 131;

float intAndFloat(int a, float b)
{
    int c = 2;
    int d = 3;
    float e = 2 + 3.4;
    b = e + e;
    intAndFloat(b, e);

    for (int i = 0; i < globalN; i++)
    {
        b = b + 1;
    }
    for (int i = 0; i < globalM; i++)
    {
        b = b + 1;
    }
    for (int i = 0; i < globalL; i++)
    {
        b = b + 1;
    }
    return b;
}

int intAndInt(int a, int b)
{
    int c = 2;
    int d = 3;
    int e = 2 + 3;
    a = b + e;
    b = e + e;
    a = b + 3;
    int f = a + a;
    c = 2;
    int X[3000] = {0};
    X[globalM] = c;
    X[c] = 12;
    X[d] = c;
    intAndFloat(X[d], 1.3);

    if (c == 2)
    {
        int x = a + b;
        a = 44;
        int y = a + b;
        f = x + y;
    }
    return f;
}

void kinds()
{
    int a;
    float b;

    a = 44 * 33;
    a = 44 / 33;
    a = 44 % 33;
    a = 44 + 33;
    a = 44 - 33;
    a = 44 << 3;
    a = 44 >> 3;
    a = 44 && 33; // odd one
    a = 44 < 33;
    a = 44 > 33;
    a = 44 <= 33;
    a = 44 >= 33;
    a = 44 == 33;
    a = 44 != 33;
    a = 44 & 33;
    a = 44 ^ 33;
    a = 44 | 33;
    a = 44 && 33;
    a = 44 || 33;

    b = 44 * 33.7;
    b = 44 / 33.7;
    b = 44 + 33.7;
    b = 44 - 33.7;
    b = 44 && 33.7; // odd one
    b = 44 < 33.7;
    b = 44 > 33.7;
    b = 44 <= 33.7;
    b = 44 >= 33.7;
    b = 44 == 33.7;
    b = 44 != 33.7;
    b = 44 && 33.7;
    b = 44 || 33.7;
}

int main()
{
    int resInt = intAndInt(5, 6);
    printf("resInt: %d\n", resInt); // 77

    float resFloat = intAndFloat(5, 6.7);
    printf("resFloat: %f\n", resFloat); // 10.800000
    return 0;
}