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

int main()
{
    gradient_t grad1 = {1.0, 2.0, 3.0};
    gradient_t grad2 = {4.0, 5.0, 6.0};

    velocity_t vel1 = {1.0, 2.0};
    velocity_t vel2 = {3.0, 4.0};

    grad1.x = 7.0;
    grad1.y = grad2.z;

    return 0;
}