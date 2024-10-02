

void loop_characterization(int A[100], int B[200], int C[300])
{
    int idx;
    int idx2 = 2;
    int idx3 = 3;

    for (int i = 0; i < 100; i++)
    {
        A[i] = 0;
    }
    for (int i = 0; i <= 200; i++)
    {
        B[i] = 0;
    }
    for (int i = 0; i <= 200; i *= 2)
    {
        B[i] = 0;
    }
    for (int i = 0; i <= 200; i = i * 2)
    {
        B[i] = 0;
    }
    for (int i = 0; 300 > i; i++)
    {
        C[i] = 0;
    }
    for (int i = 100; i > 0; i--)
    {
        A[i] = 0;
    }
    for (int i = 100; i >= 95; i--)
    {
        A[i] = 0;
    }
    for (int i = 0; i < 100; i++)
    {
        for (int j = 0; j < 200; j++)
        {
            for (int k = 0; k < 300; k++)
            {
                C[k] = A[i] + B[j];
            }
        }
    }
    for (int i = 4; i < 100; i += 2)
    {
        A[i] = 0;
    }
    for (int i = 4; i < 100; i = i + 2)
    {
        A[i] = 0;
    }
    for (idx = 1; idx < 100; idx++)
    {
        A[idx] = 0;
    }
    for (; idx2 < 100; idx2++)
    {
        A[idx2] = 0;
    }
}

int main()
{
    int A[100];
    int B[200];
    int C[300];
    loop_characterization(A, B, C);
    return 0;
}