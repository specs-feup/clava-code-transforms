void foo(int *a, int *b)
{
    int c = 0;

    for (int i = 0; i < 10; i++)
    {
        c += a[i] + b[i];
    }

    if (c > 0)
    {
        c = 1;
    }
    else
    {
        c = 0;
        {
            int x0 = 1;
            int x1 = 2;
            int x2 = 3;
            int x3 = 4;
            int x4 = 5;
            int a1[5] = {1, 2, 3, 4, 5};
            int a2[5][1] = {{1}, {2}, {3}, {4}, {5}};
            x0 = x1 + x2;
            x1 = x2 + x3;
            x2 = x3 + x4;
            x3 = x4 + x0;
            x4 = x0 + x1;
        }
        int x0 = 1;
        int x1 = 2;
        int x2 = 3;
        int x3 = 4;
        int x4 = 5;
    }

    int x0 = 1;
    int x1 = 2;
    int x2 = 3;
    int x3 = 4;
    int x4 = 5;

    {
        int x5 = 6;
        int x6 = 7;
        int x7 = 8;
        int x8 = 9;
        int x9 = 10;

        for (int j = 0; j < 5; j++)
        {
            c += x0 + x1 + x2 + x3 + x4 + x5 + x6 + x7 + x8 + x9;
        }
    }

    int x5 = 6;
    int x6 = 7;
    int x7 = 8;
    int x8 = 9;
    int x9 = 10;
}