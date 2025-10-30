typedef struct
{
    int width;
    int height;
    float data[];
} F2D;

F2D *fMallocHandle(int rows, int cols)
{
    F2D *out;
    out = (F2D *)malloc(sizeof(F2D) + sizeof(float) * rows * cols);
    out->height = rows;
    out->width = cols;
    int x;
    x = 0; // Dummy line to illustrate more code can be here
    int y = 1;
    return out;
}

int main()
{
    int myRows = 10;
    int myCols = 20;
    F2D *image = fMallocHandle(myRows, myCols);
    // Use the array...
    free(image);
    return 0;
}