#include <cstdio>
#include <cstdlib>
#include <getopt.h>
#include <string>
#include <iostream>
#include <fstream>
#include <sstream>
#include <ctime>
#include <cmath>
#include <sys/time.h>

int const MAX_HEIGHT = 436;
int const MAX_WIDTH = 1024;
typedef float pixel_t;
typedef float outer_pixel_t;
typedef float vel_pixel_t;

typedef struct
{
    pixel_t x;
    pixel_t y;
    pixel_t z;
} gradient_t;

typedef struct
{
    outer_pixel_t val[6];
} outer_t;

typedef struct
{
    outer_pixel_t val[6];
} tensor_t;

typedef struct
{
    vel_pixel_t x;
    vel_pixel_t y;
} velocity_t;

void print_usage(char *filename);
void parse_sdaccel_command_line_args(int argc, char **argv, std::string &kernelFile, std::string &dataPath, std::string &outFile);
void parse_sdsoc_command_line_args(int argc, char **argv, std::string &dataPath, std::string &outFile);

int const GRAD_WEIGHTS[5] = {1, -8, 0, 8, -1};
pixel_t const GRAD_FILTER[7] = {0.0755, 0.133, 0.1869, 0.2903, 0.1869, 0.133, 0.0755};
pixel_t const TENSOR_FILTER[3] = {0.3243, 0.3513, 0.3243};
void optical_flow_sw(pixel_t frame0[436][1024], pixel_t frame1[436][1024], pixel_t frame2[436][1024], pixel_t frame3[436][1024], pixel_t frame4[436][1024], velocity_t outputs[436][1024]);

void print_usage(char *filename)
{
    printf("usage: %s <options>\n", filename);
    printf("  -f [kernel file]\n");
    printf("  -p [path to data]\n");
    printf("  -o [path to output]\n");
}

void parse_sdaccel_command_line_args(int argc, char **argv, std::string &kernelFile, std::string &dataPath, std::string &outFile)
{
    int c = 0;
    while ((c = getopt(argc, argv, "f:p:o:")) != -1)
    { // while args present
        switch (c)
        { // matching on arguments
        case 'f':
            kernelFile = optarg;
            break;
        case 'p':
            dataPath = optarg;
            break;
        case 'o':
            outFile = optarg;
            break;
        default:
        {
            print_usage(argv[0]);
            exit(-1);
        }
        }
    }
}

void parse_sdsoc_command_line_args(int argc, char **argv, std::string &dataPath, std::string &outFile)
{
    int c = 0;
    while ((c = getopt(argc, argv, "p:o:")) != -1)
    { // while args present
        switch (c)
        { // matching on arguments
        case 'p':
            dataPath = optarg;
            break;
        case 'o':
            outFile = optarg;
            break;
        default:
        {
            print_usage(argv[0]);
            exit(-1);
        }
        }
    }
}

void check_results(velocity_t output[436][1024], float refFlow[436][2048], std::string outFile);
bool unknown_flow(float u, float v)
{

    return (fabs(u) > 1e9) || (fabs(v) > 1e9) || std::isnan(u) || std::isnan(v);
}

void check_results(velocity_t output[436][1024], float refFlow[436][2048], std::string outFile)
{
    float outFlow[436][2048] = {0};
    for (int i = 0; i < MAX_HEIGHT; i++)
    {
        for (int j = 0; j < MAX_WIDTH * 2; j += 2)
        {
            outFlow[i][j] = output[i][j].x;
            outFlow[i][j + 1] = output[i][j].y;
        }
    }
    double accum_error = 0;
    int num_pix = 0;
    for (int i = 0; i < MAX_HEIGHT; i++)
    {
        for (int j = 0; j < MAX_WIDTH * 2; j += 2)
        {
            double out_x = outFlow[i][j];
            double out_y = outFlow[i][j + 1];
            if (unknown_flow(out_x, out_y))
            {
                continue;
            }
            double out_deg = atan2(-out_y, -out_x) * 180.0 / 3.14159265358979323846;
            double ref_x = refFlow[i][j];
            double ref_y = refFlow[i][j + 1];
            double ref_deg = atan2(-ref_y, -ref_x) * 180.0 / 3.14159265358979323846;
            double error = out_deg - ref_deg;
            while (error < -180)
            {
                error += 360;
            }
            while (error > 180)
            {
                error -= 360;
            }
            accum_error += fabs(error);
            num_pix++;
        }
    }
    double avg_error = accum_error / num_pix;
    std::cout << "Average error: " << avg_error << " degrees" << std::endl;
}

void gradient_xy_calc(pixel_t frame[436][1024], pixel_t gradient_x[436][1024], pixel_t gradient_y[436][1024])
{
    pixel_t x_grad;
    pixel_t y_grad;
    for (int r = 0; r < MAX_HEIGHT + 2; r++)
    {
        for (int c = 0; c < MAX_WIDTH + 2; c++)
        {
            x_grad = 0;
            y_grad = 0;
            bool decomp_0;
            decomp_0 = r >= 4;
            bool decomp_1;
            decomp_1 = r < MAX_HEIGHT;
            bool decomp_2;
            decomp_2 = decomp_0 && decomp_1;
            bool decomp_3;
            decomp_3 = c >= 4;
            bool decomp_4;
            decomp_4 = decomp_2 && decomp_3;
            bool decomp_5;
            decomp_5 = c < MAX_WIDTH;
            bool decomp_6;
            decomp_6 = decomp_4 && decomp_5;
            if (decomp_6)
            {
                for (int i = 0; i < 5; i++)
                {
                    x_grad = x_grad + frame[r - 2][c - i] * GRAD_WEIGHTS[4 - i];
                    y_grad = y_grad + frame[r - i][c - 2] * GRAD_WEIGHTS[4 - i];
                }
                gradient_x[r - 2][c - 2] = x_grad / 12;
                gradient_y[r - 2][c - 2] = y_grad / 12;
            }
            else
            {
                bool decomp_7;
                decomp_7 = r >= 2;
                bool decomp_8;
                decomp_8 = c >= 2;
                bool decomp_9;
                decomp_9 = decomp_7 && decomp_8;
                if (decomp_9)
                {
                    gradient_x[r - 2][c - 2] = 0;
                    gradient_y[r - 2][c - 2] = 0;
                }
            }
        }
    }
}

void gradient_z_calc(pixel_t frame0[436][1024], pixel_t frame1[436][1024], pixel_t frame2[436][1024], pixel_t frame3[436][1024], pixel_t frame4[436][1024], pixel_t gradient_z[436][1024])
{
    for (int r = 0; r < MAX_HEIGHT; r++)
    {
        for (int c = 0; c < MAX_WIDTH; c++)
        {
            gradient_z[r][c] = 0.0f;
            gradient_z[r][c] = gradient_z[r][c] + frame0[r][c] * GRAD_WEIGHTS[0];
            gradient_z[r][c] = gradient_z[r][c] + frame1[r][c] * GRAD_WEIGHTS[1];
            gradient_z[r][c] = gradient_z[r][c] + frame2[r][c] * GRAD_WEIGHTS[2];
            gradient_z[r][c] = gradient_z[r][c] + frame3[r][c] * GRAD_WEIGHTS[3];
            gradient_z[r][c] = gradient_z[r][c] + frame4[r][c] * GRAD_WEIGHTS[4];
            gradient_z[r][c] = gradient_z[r][c] / 12.0f;
        }
    }
}

void gradient_weight_y(pixel_t gradient_x[436][1024], pixel_t gradient_y[436][1024], pixel_t gradient_z[436][1024], gradient_t filt_grad[436][1024])
{
    for (int r = 0; r < MAX_HEIGHT + 3; r++)
    {
        for (int c = 0; c < MAX_WIDTH; c++)
        {
            gradient_t acc;
            acc.x = 0;
            acc.y = 0;
            acc.z = 0;
            bool decomp_0;
            decomp_0 = r >= 6;
            bool decomp_1;
            decomp_1 = r < MAX_HEIGHT;
            bool decomp_2;
            decomp_2 = decomp_0 && decomp_1;
            if (decomp_2)
            {
                for (int i = 0; i < 7; i++)
                {
                    acc.x = acc.x + gradient_x[r - i][c] * GRAD_FILTER[i];
                    acc.y = acc.y + gradient_y[r - i][c] * GRAD_FILTER[i];
                    acc.z = acc.z + gradient_z[r - i][c] * GRAD_FILTER[i];
                }
                filt_grad[r - 3][c] = acc;
            }
            else
            {
                bool decomp_3;
                decomp_3 = r >= 3;
                if (decomp_3)
                {
                    filt_grad[r - 3][c] = acc;
                }
            }
        }
    }
}

void gradient_weight_x(gradient_t y_filt[436][1024], gradient_t filt_grad[436][1024])
{
    for (int r = 0; r < MAX_HEIGHT; r++)
    {
        for (int c = 0; c < MAX_WIDTH + 3; c++)
        {
            gradient_t acc;
            acc.x = 0;
            acc.y = 0;
            acc.z = 0;
            bool decomp_0;
            decomp_0 = c >= 6;
            bool decomp_1;
            decomp_1 = c < MAX_WIDTH;
            bool decomp_2;
            decomp_2 = decomp_0 && decomp_1;
            if (decomp_2)
            {
                for (int i = 0; i < 7; i++)
                {
                    acc.x = acc.x + y_filt[r][c - i].x * GRAD_FILTER[i];
                    acc.y = acc.y + y_filt[r][c - i].y * GRAD_FILTER[i];
                    acc.z = acc.z + y_filt[r][c - i].z * GRAD_FILTER[i];
                }
                filt_grad[r][c - 3] = acc;
            }
            else
            {
                bool decomp_3;
                decomp_3 = c >= 3;
                if (decomp_3)
                {
                    filt_grad[r][c - 3] = acc;
                }
            }
        }
    }
}

void outer_product(gradient_t gradient[436][1024], outer_t outer_product[436][1024])
{
    for (int r = 0; r < MAX_HEIGHT; r++)
    {
        for (int c = 0; c < MAX_WIDTH; c++)
        {
            gradient_t grad;
            grad = gradient[r][c];
            outer_t out;
            out.val[0] = grad.x * grad.x;
            out.val[1] = grad.y * grad.y;
            out.val[2] = grad.z * grad.z;
            out.val[3] = grad.x * grad.y;
            out.val[4] = grad.x * grad.z;
            out.val[5] = grad.y * grad.z;
            outer_product[r][c] = out;
        }
    }
}

void tensor_weight_y(outer_t outer[436][1024], tensor_t tensor_y[436][1024])
{
    for (int r = 0; r < MAX_HEIGHT + 1; r++)
    {
        for (int c = 0; c < MAX_WIDTH; c++)
        {
            tensor_t acc;
            for (int k = 0; k < 6; k++)
            {
                acc.val[k] = 0;
            }
            bool decomp_0;
            decomp_0 = r >= 2;
            bool decomp_1;
            decomp_1 = r < MAX_HEIGHT;
            bool decomp_2;
            decomp_2 = decomp_0 && decomp_1;
            if (decomp_2)
            {
                for (int i = 0; i < 3; i++)
                {
                    for (int component = 0; component < 6; component++)
                    {
                        acc.val[component] = acc.val[component] + outer[r - i][c].val[component] * TENSOR_FILTER[i];
                    }
                }
            }
            bool decomp_3;
            decomp_3 = r >= 1;
            if (decomp_3)
            {
                tensor_y[r - 1][c] = acc;
            }
        }
    }
}

void tensor_weight_x(tensor_t tensor_y[436][1024], tensor_t tensor[436][1024])
{
    for (int r = 0; r < MAX_HEIGHT; r++)
    {
        for (int c = 0; c < MAX_WIDTH + 1; c++)
        {
            tensor_t acc;
            for (int k = 0; k < 6; k++)
            {
                acc.val[k] = 0;
            }
            bool decomp_0;
            decomp_0 = c >= 2;
            bool decomp_1;
            decomp_1 = c < MAX_WIDTH;
            bool decomp_2;
            decomp_2 = decomp_0 && decomp_1;
            if (decomp_2)
            {
                for (int i = 0; i < 3; i++)
                {
                    for (int component = 0; component < 6; component++)
                    {
                        acc.val[component] = acc.val[component] + tensor_y[r][c - i].val[component] * TENSOR_FILTER[i];
                    }
                }
            }
            bool decomp_3;
            decomp_3 = c >= 1;
            if (decomp_3)
            {
                tensor[r][c - 1] = acc;
            }
        }
    }
}

void flow_calc(tensor_t tensors[436][1024], velocity_t output[436][1024])
{
    for (int r = 0; r < MAX_HEIGHT; r++)
    {
        for (int c = 0; c < MAX_WIDTH; c++)
        {
            bool decomp_0;
            decomp_0 = r >= 2;
            int decomp_1;
            decomp_1 = MAX_HEIGHT - 2;
            bool decomp_2;
            decomp_2 = r < decomp_1;
            bool decomp_3;
            decomp_3 = decomp_0 && decomp_2;
            bool decomp_4;
            decomp_4 = c >= 2;
            bool decomp_5;
            decomp_5 = decomp_3 && decomp_4;
            int decomp_6;
            decomp_6 = MAX_WIDTH - 2;
            bool decomp_7;
            decomp_7 = c < decomp_6;
            bool decomp_8;
            decomp_8 = decomp_5 && decomp_7;
            if (decomp_8)
            {
                pixel_t denom;
                denom = tensors[r][c].val[0] * tensors[r][c].val[1] - tensors[r][c].val[3] * tensors[r][c].val[3];
                output[r][c].x = (tensors[r][c].val[5] * tensors[r][c].val[3] - tensors[r][c].val[4] * tensors[r][c].val[1]) / denom;
                output[r][c].y = (tensors[r][c].val[4] * tensors[r][c].val[3] - tensors[r][c].val[5] * tensors[r][c].val[0]) / denom;
            }
            else
            {
                output[r][c].x = 0;
                output[r][c].y = 0;
            }
        }
    }
}

pixel_t optical_flow_sw_static_gradient_x[436][1024];
pixel_t optical_flow_sw_static_gradient_y[436][1024];
pixel_t optical_flow_sw_static_gradient_z[436][1024];
gradient_t optical_flow_sw_static_y_filtered[436][1024];
gradient_t optical_flow_sw_static_filtered_gradient[436][1024];
outer_t optical_flow_sw_static_out_product[436][1024];
tensor_t optical_flow_sw_static_tensor_y[436][1024];
tensor_t optical_flow_sw_static_tensor[436][1024];
void optical_flow_sw(pixel_t frame0[436][1024], pixel_t frame1[436][1024], pixel_t frame2[436][1024], pixel_t frame3[436][1024], pixel_t frame4[436][1024], velocity_t outputs[436][1024])
{
    gradient_xy_calc(frame2, optical_flow_sw_static_gradient_x, optical_flow_sw_static_gradient_y);
    gradient_z_calc(frame0, frame1, frame2, frame3, frame4, optical_flow_sw_static_gradient_z);
    gradient_weight_y(optical_flow_sw_static_gradient_x, optical_flow_sw_static_gradient_y, optical_flow_sw_static_gradient_z, optical_flow_sw_static_y_filtered);
    gradient_weight_x(optical_flow_sw_static_y_filtered, optical_flow_sw_static_filtered_gradient);
    outer_product(optical_flow_sw_static_filtered_gradient, optical_flow_sw_static_out_product);
    tensor_weight_y(optical_flow_sw_static_out_product, optical_flow_sw_static_tensor_y);
    tensor_weight_x(optical_flow_sw_static_tensor_y, optical_flow_sw_static_tensor);
    flow_calc(optical_flow_sw_static_tensor, outputs);
}

int main(int argc, char **argv)
{
    printf("Optical Flow Application\n");
    std::string dataPath("");
    std::string outFile("");
    parse_sdsoc_command_line_args(argc, argv, dataPath, outFile);
    std::string frame_files[5];
    std::string reference_file;
    frame_files[0] = dataPath + "/frame1.dat";
    frame_files[1] = dataPath + "/frame2.dat";
    frame_files[2] = dataPath + "/frame3.dat";
    frame_files[3] = dataPath + "/frame4.dat";
    frame_files[4] = dataPath + "/frame5.dat";
    reference_file = dataPath + "/ref.flo.dat";
    static pixel_t frames[5][436][1024];
    static velocity_t outputs[436][1024];
    static float refFlow[436][2048] = {0};
    printf("Reading input files ... \n");
    for (int k = 0; k < 5; k++)
    {
        FILE *file = fopen(frame_files[k].c_str(), "r");
        int row = 0;
        int col = 0;
        while (row < MAX_HEIGHT)
        {
            fscanf(file, "%f,", &frames[k][row][col]);
            col++;
            if (col >= MAX_WIDTH)
            {
                row++;
                col = 0;
            }
        }
    }
    printf("Reading reference output flow... \n");
    FILE *file = fopen(reference_file.c_str(), "r");
    int row = 0;
    int col = 0;
    while (row < MAX_HEIGHT)
    {
        fscanf(file, "%f,", &refFlow[row][col]);
        col++;
        if (col >= MAX_WIDTH * 2)
        {
            row++;
            col = 0;
        }
    }
    struct timeval start, end;
    gettimeofday(&start, 0);
    optical_flow_sw(frames[0], frames[1], frames[2], frames[3], frames[4], outputs);
    gettimeofday(&end, 0);
    check_results(outputs, refFlow, outFile);
    long long elapsed = (end.tv_sec - start.tv_sec) * 1000000LL + end.tv_usec - start.tv_usec;
    printf("elapsed time: %lld us\n", elapsed);

    return 0;
}
