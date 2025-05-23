#include <cstdio>
#include <cstdlib>
#include <getopt.h>
#include <string>
#include <time.h>
#include <fstream>
#include <iostream>
#include <sys/time.h>

// resolution 256x256

int const MAX_X = 256;
int const MAX_Y = 256;
// number of values in frame buffer: 32 bits

int const NUM_FB = MAX_X * MAX_Y / 4;
// dataset information

int const NUM_3D_TRI = 3192;
// target device

// change here to map to a different device

// hls header

// specialized datatypes

typedef unsigned char bit8;
typedef unsigned int bit32;
// struct: 3D triangle

typedef struct
{
    bit8 x0;
    bit8 y0;
    bit8 z0;
    bit8 x1;
    bit8 y1;
    bit8 z1;
    bit8 x2;
    bit8 y2;
    bit8 z2;
} Triangle_3D;

// struct: 2D triangle

typedef struct
{
    bit8 x0;
    bit8 y0;
    bit8 x1;
    bit8 y1;
    bit8 x2;
    bit8 y2;
    bit8 z;
} Triangle_2D;

// struct: candidate pixels

typedef struct
{
    bit8 x;
    bit8 y;
    bit8 z;
    bit8 color;
} CandidatePixel;

// struct: colored pixel

typedef struct
{
    bit8 x;
    bit8 y;
    bit8 color;
} Pixel;

/*===============================================================*/
/**/
/*rendering_sw.cpp*/
/**/
/*Software version for 3D Rendering*/
/**/
/*===============================================================*/
/*======================UTILITY FUNCTIONS========================*/
// Determine whether three vertices of a trianlgLe
// (x0,y0) (x1,y1) (x2,y2) are in clockwise order by Pineda algorithm
// if so, return a number > 0
// else if three points are in line, return a number == 0
// else in counterclockwise order, return a number < 0
int check_clockwise(Triangle_2D triangle_2d)
{
    int cw;
    cw = (triangle_2d.x2 - triangle_2d.x0) * (triangle_2d.y1 - triangle_2d.y0) - (triangle_2d.y2 - triangle_2d.y0) * (triangle_2d.x1 - triangle_2d.x0);

    return cw;
}

// swap (x0, y0) (x1, y1) of a Triangle_2D
void clockwise_vertices(Triangle_2D *triangle_2d)
{
    bit8 tmp_x, tmp_y;
    tmp_x = triangle_2d->x0;
    tmp_y = triangle_2d->y0;
    triangle_2d->x0 = triangle_2d->x1;
    triangle_2d->y0 = triangle_2d->y1;
    triangle_2d->x1 = tmp_x;
    triangle_2d->y1 = tmp_y;
}

// Given a pixel, determine whether it is inside the triangle
// by Pineda algorithm
// if so, return true
// else, return false
bool pixel_in_triangle(bit8 x, bit8 y, Triangle_2D triangle_2d)
{
    int pi0, pi1, pi2;
    pi0 = (x - triangle_2d.x0) * (triangle_2d.y1 - triangle_2d.y0) - (y - triangle_2d.y0) * (triangle_2d.x1 - triangle_2d.x0);
    pi1 = (x - triangle_2d.x1) * (triangle_2d.y2 - triangle_2d.y1) - (y - triangle_2d.y1) * (triangle_2d.x2 - triangle_2d.x1);
    pi2 = (x - triangle_2d.x2) * (triangle_2d.y0 - triangle_2d.y2) - (y - triangle_2d.y2) * (triangle_2d.x0 - triangle_2d.x2);

    return (pi0 >= 0 && pi1 >= 0 && pi2 >= 0);
}

// find the min from 3 integers
bit8 find_min(bit8 in0, bit8 in1, bit8 in2)
{
    if (in0 < in1)
    {
        if (in0 < in2)
            return in0;
        else
            return in2;
    }
    else
    {
        if (in1 < in2)
            return in1;
        else
            return in2;
    }
}

// find the max from 3 integers
bit8 find_max(bit8 in0, bit8 in1, bit8 in2)
{
    if (in0 > in1)
    {
        if (in0 > in2)
            return in0;
        else
            return in2;
    }
    else
    {
        if (in1 > in2)
            return in1;
        else
            return in2;
    }
}

/*======================PROCESSING STAGES========================*/
// project a 3D triangle to a 2D triangle
void projection(Triangle_3D triangle_3d, Triangle_2D *triangle_2d, int angle)
{
    // Setting camera to (0,0,-1), the canvas at z=0 plane
    // The 3D model lies in z>0 space
    // The coordinate on canvas is proportional to the corresponding coordinate
    // on space
    if (angle == 0)
    {
        triangle_2d->x0 = triangle_3d.x0;
        triangle_2d->y0 = triangle_3d.y0;
        triangle_2d->x1 = triangle_3d.x1;
        triangle_2d->y1 = triangle_3d.y1;
        triangle_2d->x2 = triangle_3d.x2;
        triangle_2d->y2 = triangle_3d.y2;
        triangle_2d->z = triangle_3d.z0 / 3 + triangle_3d.z1 / 3 + triangle_3d.z2 / 3;
    }
    else if (angle == 1)
    {
        triangle_2d->x0 = triangle_3d.x0;
        triangle_2d->y0 = triangle_3d.z0;
        triangle_2d->x1 = triangle_3d.x1;
        triangle_2d->y1 = triangle_3d.z1;
        triangle_2d->x2 = triangle_3d.x2;
        triangle_2d->y2 = triangle_3d.z2;
        triangle_2d->z = triangle_3d.y0 / 3 + triangle_3d.y1 / 3 + triangle_3d.y2 / 3;
    }
    else if (angle == 2)
    {
        triangle_2d->x0 = triangle_3d.z0;
        triangle_2d->y0 = triangle_3d.y0;
        triangle_2d->x1 = triangle_3d.z1;
        triangle_2d->y1 = triangle_3d.y1;
        triangle_2d->x2 = triangle_3d.z2;
        triangle_2d->y2 = triangle_3d.y2;
        triangle_2d->z = triangle_3d.x0 / 3 + triangle_3d.x1 / 3 + triangle_3d.x2 / 3;
    }
}

// calculate bounding box for a 2D triangle
bool rasterization1(Triangle_2D triangle_2d, bit8 max_min[], int max_index[])
{
    // clockwise the vertices of input 2d triangle
    if (check_clockwise(triangle_2d) == 0)
        return 1;
    if (check_clockwise(triangle_2d) < 0)
        clockwise_vertices(&triangle_2d);
    // find the rectangle bounds of 2D triangles
    max_min[0] = find_min(triangle_2d.x0, triangle_2d.x1, triangle_2d.x2);
    max_min[1] = find_max(triangle_2d.x0, triangle_2d.x1, triangle_2d.x2);
    max_min[2] = find_min(triangle_2d.y0, triangle_2d.y1, triangle_2d.y2);
    max_min[3] = find_max(triangle_2d.y0, triangle_2d.y1, triangle_2d.y2);
    max_min[4] = max_min[1] - max_min[0];
    // calculate index for searching pixels
    max_index[0] = (max_min[1] - max_min[0]) * (max_min[3] - max_min[2]);

    return 0;
}

// find pixels in the triangles from the bounding box
int rasterization2(bool flag, bit8 max_min[], int max_index[], Triangle_2D triangle_2d, CandidatePixel fragment[])
{
    // clockwise the vertices of input 2d triangle
    if (flag)
    {

        return 0;
    }
    bit8 color = 100;
    int i = 0;
RAST2:
    for (int k = 0; k < max_index[0]; k++)
    {
        bit8 x = max_min[0] + k % max_min[4];
        bit8 y = max_min[2] + k / max_min[4];
        if (pixel_in_triangle(x, y, triangle_2d))
        {
            fragment[i].x = x;
            fragment[i].y = y;
            fragment[i].z = triangle_2d.z;
            fragment[i].color = color;
            i++;
        }
    }

    return i;
}

// filter hidden pixels
int zculling(int counter, CandidatePixel fragments[], int size, Pixel pixels[])
{
    // initilize the z-buffer in rendering first triangle for an image
    static bit8 z_buffer[256][256];
    if (counter == 0)
    {
    ZCULLING_INIT_ROW:
        for (int i = 0; i < MAX_X; i++)
        {
        ZCULLING_INIT_COL:
            for (int j = 0; j < MAX_Y; j++)
            {
                z_buffer[i][j] = 255;
            }
        }
    }
    // pixel counter
    int pixel_cntr = 0;
// update z-buffer and pixels
ZCULLING:
    for (int n = 0; n < size; n++)
    {
        if (fragments[n].z < z_buffer[fragments[n].y][fragments[n].x])
        {
            pixels[pixel_cntr].x = fragments[n].x;
            pixels[pixel_cntr].y = fragments[n].y;
            pixels[pixel_cntr].color = fragments[n].color;
            pixel_cntr++;
            z_buffer[fragments[n].y][fragments[n].x] = fragments[n].z;
        }
    }

    return pixel_cntr;
}

// color the frame buffer
void coloringFB(int counter, int size_pixels, Pixel pixels[], bit8 frame_buffer[256][256])
{
    if (counter == 0)
    {
    // initilize the framebuffer for a new image
    COLORING_FB_INIT_ROW:
        for (int i = 0; i < MAX_X; i++)
        {
        COLORING_FB_INIT_COL:
            for (int j = 0; j < MAX_Y; j++)
                frame_buffer[i][j] = 0;
        }
    }
// update the framebuffer
COLORING_FB:
    for (int i = 0; i < size_pixels; i++)
        frame_buffer[pixels[i].x][pixels[i].y] = pixels[i].color;
}

/*========================TOP FUNCTION===========================*/
void rendering_sw(Triangle_3D triangle_3ds[3192], bit8 output[256][256])
{
    // local variables
    // 2D triangle
    Triangle_2D triangle_2ds;
    // projection angle
    int angle = 0;
    // max-min index arrays
    bit8 max_min[5];
    int max_index[1];
    // fragments
    CandidatePixel fragment[500];
    // pixel buffer
    Pixel pixels[500];
    // processing NUM_3D_TRI 3D triangles
    for (int i = 0; i < NUM_3D_TRI; i++)
    {
        // five stages for processing each 3D triangle
        projection(triangle_3ds[i], &triangle_2ds, angle);
        bool flag = rasterization1(triangle_2ds, max_min, max_index);
        int size_fragment = rasterization2(flag, max_min, max_index, triangle_2ds, fragment);
        int size_pixels = zculling(i, fragment, size_fragment, pixels);
        coloringFB(i, size_pixels, pixels, output);
    }
}

void print_usage(char *filename)
{
    printf("usage: %s <options>\n", filename);
    printf("  -f [kernel file]\n");
}

void parse_sdaccel_command_line_args(int argc, char **argv, std::string &kernelFile)
{
    int c = 0;
    while ((c = getopt(argc, argv, "f:")) != -1)
    { // while args present
        switch (c)
        { // matching on arguments
        case 'f':
            kernelFile = optarg;
            break;
        default:
        {
            print_usage(argv[0]);
            exit(-1);
        }
        }
    }
}

void check_results(bit8 output[256][256])
{
    // read result from the 32-bit output buffer
    // print result
    std::ofstream ofile;
    ofile.open("outputs.txt");
    if (ofile.is_open())
    {
        ofile << "Image After Rendering: \n";
        for (int j = MAX_X - 1; j >= 0; j--)
        {
            for (int i = 0; i < MAX_Y; i++)
            {
                int pix;
                pix = output[i][j];
                if (pix)
                    ofile << "1";
                else
                    ofile << "0";
            }
            ofile << std::endl;
        }
    }
    else
    {
        std::cout << "Failed to create output file!" << std::endl;
    }
}

int const num_3d_triangles = 3192;
Triangle_3D triangle_3ds[3192] = {0};
/*===============================================================*/
/**/
/*3d_rendering.cpp*/
/**/
/*Main host function for the 3D Rendering application.*/
/**/
/*===============================================================*/
// standard C/C++ headers
// harness headers
// harness namespace
// sdsoc headers
// hardware function declaration
// other headers
// data
int main(int argc, char **argv)
{
    printf("3D Rendering Application\n");
    // parse command line arguments for opencl version
    // sdsoc and sw versions have no additional command line arguments
    // for this benchmark, data is included in array triangle_3ds
    // timers
    struct timeval start, end;
    // opencl version host code
    // create space for input and output
    // pack input data for better performance
    // create OpenCL world
    // add the bitstream file
    // create kernels
    // this kernel is written in C++
    // create mem objects
    // start timer
    // add them to the world
    // added in sequence, each of them can be referenced by an index
    // set work size
    // add them to the world
    // set kernel arguments
    // run!
    // read the data back
    // end timer
    // create space for input and output
    // pack input data for better performance
    // run hardware function and time it
    // output
    bit8 output[256][256];
    // run and time sw function
    gettimeofday(&start, 0);
    rendering_sw(triangle_3ds, output);
    gettimeofday(&end, 0);
    // check results
    printf("Checking results:\n");
    check_results(output);
    // print time
    long long elapsed = (end.tv_sec - start.tv_sec) * 1000000LL + end.tv_usec - start.tv_usec;
    printf("elapsed time: %lld us\n", elapsed);
    // cleanup

    return 0;
}
