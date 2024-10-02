#include <stdio.h>
#include <stdlib.h>

#define SIZE1 256
#define SIZE2 128
#define SIZE3 32
#define SIZE4 8
#define SIZE5 4

// Function to sum a 1D array
int sum1DArray(int arr[SIZE1])
{
    int sum = 0;
    for (int i = 0; i < SIZE1; i++)
    {
        sum += arr[i];
    }
    return sum;
}

// Function to sum a 2D array
int sum2DArray(int arr[SIZE1][SIZE2])
{
    int sum = 0;
    for (int i = 0; i < SIZE1; i++)
    {
        for (int j = 0; j < SIZE2; j++)
        {
            sum += arr[i][j];
        }
    }
    return sum;
}

// Function to sum a 3D array
int sum3DArray(int arr[SIZE1][SIZE2][SIZE3])
{
    int sum = 0;
    for (int i = 0; i < SIZE1; i++)
    {
        for (int j = 0; j < SIZE2; j++)
        {
            for (int k = 0; k < SIZE3; k++)
            {
                sum += arr[i][j][k];
            }
        }
    }
    return sum;
}

// Function to sum a 4D array
int sum4DArray(int arr[SIZE4][SIZE4][SIZE4][SIZE4])
{
    int sum = 0;
    for (int i = 0; i < SIZE4; i++)
    {
        for (int j = 0; j < SIZE4; j++)
        {
            for (int k = 0; k < SIZE4; k++)
            {
                for (int l = 0; l < SIZE4; l++)
                {
                    sum += arr[i][j][k][l];
                }
            }
        }
    }
    return sum;
}

// Function to sum a 5D array
int sum5DArray(int arr[SIZE5][SIZE5][SIZE5][SIZE5][SIZE5])
{
    int sum = 0;
    for (int i = 0; i < SIZE5; i++)
    {
        for (int j = 0; j < SIZE5; j++)
        {
            for (int k = 0; k < SIZE5; k++)
            {
                for (int l = 0; l < SIZE5; l++)
                {
                    for (int m = 0; m < SIZE5; m++)
                    {
                        sum += arr[i][j][k][l][m];
                    }
                }
            }
        }
    }
    return sum;
}

int main()
{
    int arr1D[SIZE1];
    int arr2D[SIZE1][SIZE2];
    int arr3D[SIZE1][SIZE2][SIZE3];
    int arr4D[SIZE4][SIZE4][SIZE4][SIZE4];
    int arr5D[SIZE5][SIZE5][SIZE5][SIZE5][SIZE5];

    // Fill the 1D, 2D, 3D, 4D and 5D arrays with random values
    for (int i = 0; i < SIZE1; i++)
    {
        arr1D[i] = rand() % RAND_MAX; // Random number between 0 and 99
        for (int j = 0; j < SIZE2; j++)
        {
            arr2D[i][j] = rand() % 100; // Random number between 0 and 99
            for (int k = 0; k < SIZE3; k++)
            {
                arr3D[i][j][k] = rand() % 100; // Random number between 0 and 99
            }
        }
    }

    for (int i = 0; i < SIZE4; i++)
    {
        for (int j = 0; j < SIZE4; j++)
        {
            for (int k = 0; k < SIZE4; k++)
            {
                arr4D[i][j][k][k % SIZE4] = rand() % 100; // Random number between 0 and 99
                for (int l = 0; l < SIZE4; l++)
                {
                    arr5D[i][j][k][l][l % SIZE5] = rand() % 100; // Random number between 0 and 99
                }
            }
        }
    }

    int sum1D = sum1DArray(arr1D);
    int sum2D = sum2DArray(arr2D);
    int sum3D = sum3DArray(arr3D);
    int sum4D = sum4DArray(arr4D);
    int sum5D = sum5DArray(arr5D);

    printf("Sum of 1D array: %d, expected %d (%s)\n", sum1D, 971773852, (sum1D == 971773852) ? "PASSED" : "FAILED");
    printf("Sum of 2D array: %d, expected %d (%s)\n", sum2D, 1617520, (sum2D == 1617520) ? "PASSED" : "FAILED");
    printf("Sum of 3D array: %d, expected %d (%s)\n", sum3D, 51908509, (sum3D == 51908509) ? "PASSED" : "FAILED");
    printf("Sum of 4D array: %d, expected %d (%s)\n", sum4D, 39706, (sum4D == 39706) ? "PASSED" : "FAILED");
    printf("Sum of 5D array: %d, expected %d (%s)\n", sum5D, 12322, (sum5D == 12322) ? "PASSED" : "FAILED");
    return 0;
}