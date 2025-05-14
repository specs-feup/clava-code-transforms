#include <stdlib.h>
#include <stdio.h>

int canHoistPrintf(int a, int b)
{
    printf("%d %d\n", a, b);
    int c = a + b;
    return c;
}

int cannotHoistPrintf(int a, int b)
{
    int c = a + b;
    printf("%d\n", c);
    return c;
}

int calledMultipleTimes(int a, int b)
{
    int c = a + b;
    printf("%d\n", c);
    return c;
}

int main()
{
    int a = 5;
    int b = 10;
    int c = canHoistPrintf(a, b);
    int d = cannotHoistPrintf(a, b);
    int e = calledMultipleTimes(a, b);
    int f = calledMultipleTimes(a, b);
    return 0;
}