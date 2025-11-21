typedef struct
{
    int width;
    int height;
    float data[];
} F2D;

F2D *allocate(int rows, int cols)
{
    F2D *matrix = (F2D *)malloc(sizeof(F2D) + sizeof(float) * rows * cols);
    matrix->height = rows;
    matrix->width = cols;
    return matrix;
}

int main()
{
    int rows = 10;
    int cols = 10;
    F2D *myMatrix = allocate(rows, cols);

    // Initialize matrix
    for (int i = 0; i < rows; i++)
    {
        for (int j = 0; j < cols; j++)
        {
            myMatrix->data[i * cols + j] = (float)(i * cols + j);
        }
    }

    // Free allocated memory
    free(myMatrix);

    return 0;
}