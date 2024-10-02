void foo(int *A, double *B, char C[])
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
                return;
            C[j] = C[j] + 2;
            for (int k = 0; k < 100; k++)
            {
                C[k] = C[k] + 3;

#pragma clava begin_outline
                *A = 12;
                C[1] = *B;
                *X = 1515;
                *B = 1.2;
#pragma clava end_outline

                if (C[k] > 0)
                {
                    return;
                }
                for (int l = 0; l < 100; l++)
                {
                    C[l] = C[l] + 4;
                }
            }
        }
    }
}

int main()
{
    int A = 0;
    double B = 0;
    char C[100];
    foo(&A, &B, C);
    return 0;
}