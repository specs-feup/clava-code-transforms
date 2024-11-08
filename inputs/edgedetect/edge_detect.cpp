#include <cstdlib>
#include <cstdio>
#include <cmath>
#include <chrono>
#include <iostream>

using namespace std;
using namespace std::chrono;

// Universal params
#define ITER 0 // 1000

#define K 3
#define N 512 // 128
#define T 50  // 127

#define H N
#define W N

// #define FORCE_EXTERNAL

void rgbToGrayscale(int input_image[H][W * 3], int output_image[H][W])
{
    for (int i = 0; i < H; i++)
    {
        int jj = 0;
        for (int j = 0; j < W; j++)
        {
            int r = input_image[i][jj];
            int g = input_image[i][jj + 1];
            int b = input_image[i][jj + 2];
            jj += 3;

            float gray = 0.299 * r + 0.587 * g + 0.114 * b;
            output_image[i][j] = (int)floor(gray);
        }
    }
}

void convolve2d(
    int input_image[H][W],
    int filter[K][K],
    int output_image[H][W])
{
    int i;
    int j;
    int c;
    int r;
    int normal_factor;
    int sum;
    int dead_rows;
    int dead_cols;

    dead_rows = K / 2;
    dead_cols = K / 2;

    normal_factor = 0;
    for (r = 0; r < K; r++)
    {
        for (c = 0; c < K; c++)
        {
            normal_factor += abs(filter[r][c]);
        }
    }

    if (normal_factor == 0)
        normal_factor = 1;

    for (r = 0; r < H - K + 1; r++)
    {
        for (c = 0; c < W - K + 1; c++)
        {
            sum = 0;
            for (i = 0; i < K; i++)
            {
                for (j = 0; j < K; j++)
                {
                    sum += input_image[(r + i)][(c + j)] * filter[i][j];
                }
            }
            output_image[(r + dead_rows)][(c + dead_cols)] = (sum / normal_factor);
        }
    }
}

void combthreshold(int image_gray[H][W], int temp_buf[H][W], int output[H][W])
{
    int i, j;
    int temp1;
    int temp2;
    int temp3;

    for (i = 0; i < H; i++)
    {
        for (j = 0; j < W; ++j)
        {
            temp1 = abs(image_gray[i][j]);
            temp2 = abs(temp_buf[i][j]);
            temp3 = (temp1 > temp2) ? temp1 : temp2;
            output[i][j] = (temp3 > T) ? 255 : 0;
        }
    }
}

void edge_detect(int image_rgb[H][W * 3],
                 int image_gray[H][W],
                 int temp_buf[H][W],
                 int filter[K][K],
                 int output[H][W])
{
    rgbToGrayscale(image_rgb, image_gray);

    filter[0][0] = 1;
    filter[0][1] = 2;
    filter[0][2] = 1;
    filter[1][0] = 2;
    filter[1][1] = 4;
    filter[1][2] = 2;
    filter[2][0] = 1;
    filter[2][1] = 2;
    filter[2][2] = 1;

    convolve2d(image_gray, filter, output);

#ifdef FORCE_EXTERNAL
    printf("This is just here to force an external call, don't mind me. Here's a number: %d\n", filter[4]);
#endif

    filter[0][0] = 1;
    filter[0][1] = 0;
    filter[0][2] = -1;
    filter[1][0] = 2;
    filter[1][1] = 0;
    filter[1][2] = -2;
    filter[2][0] = 1;
    filter[2][1] = 0;
    filter[2][2] = -1;

    convolve2d(output, filter, image_gray);

    filter[0][0] = 1;
    filter[0][1] = 2;
    filter[0][2] = 1;
    filter[1][0] = 0;
    filter[1][1] = 0;
    filter[1][2] = 0;
    filter[2][0] = -1;
    filter[2][1] = -2;
    filter[2][2] = -1;

    convolve2d(output, filter, temp_buf);

    combthreshold(image_gray, temp_buf, output);
}

int main()
{
    int image_rgb[H][W * 3] = {
        // #include "img_512_512.dat"
        0};
    int image_gray[H][W] = {0};
    int temp_buf[H][W] = {0};
    int filter[K][K] = {{0, 0, 0}, {0, 0, 0}, {0, 0, 0}};
    int output[H][W] = {0};

    auto start = high_resolution_clock::now();
#if ITER > 0
    int i;
    for (i = 0; i < ITER; i++)
    {
#endif
        edge_detect(
            image_rgb,
            image_gray,
            temp_buf,
            filter,
            output);
#if ITER > 0
    }
#endif
    auto stop = high_resolution_clock::now();
    auto duration = duration_cast<microseconds>(stop - start);
    std::cout << "Duration: " << duration.count() << std::endl;

    int actual = 0;
    int real = 2455650;
    for (int i = 0; i < H; i++)
    {
        for (int j = 0; j < W; j++)
        {
            actual += output[i][j];
        }
    }
    cout << "Checksum: real = " << real << ", actual = " << actual << (real == actual ? " (VERIFIED)" : " (ERROR)") << endl;

    return 0;
}