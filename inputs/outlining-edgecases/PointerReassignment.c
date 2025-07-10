#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct
{
    int width;
    int height;
    int data[];
} I2D;

int main()
{
    I2D *s1;
    I2D *s2;

    s1 = (I2D *)malloc(sizeof(I2D) + 10 * sizeof(int));
#pragma clava begin_outline
    s1->width = 10;
    s1->height = 10;
    strcpy((char *)s1->data, "Hello");

    s2 = (I2D *)malloc(sizeof(I2D) + 20 * sizeof(int));
    s2->width = 20;
    s2->height = 20;
    strcpy((char *)s2->data, "World");
#pragma clava end_outline

    printf("s1: %d, %d, %s\n", s1->width, s1->height, (char *)s1->data);
    printf("s2: %d, %d, %s\n", s2->width, s2->height, (char *)s2->data);

    free(s1);
    free(s2);
    return 0;
}