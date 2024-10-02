#include <stdio.h>

// Define a struct representing a point
typedef struct {
    int x;
    int y;
} Point;

// Function that modifies a point struct by value
void modifyPointByValue(Point point) {
    point.x = 10;
    point.y = 20;
}

// Function that modifies a point struct by reference
void modifyPointByReference(Point *point) {
    point->x = 30;
    point->y = 40;
}

int main() {
    // Create a point struct
    Point myPoint;
    myPoint.x = 5;
    myPoint.y = 15;

    // Access the point struct by value
    printf("Before modification by value: (%d, %d)\n", myPoint.x, myPoint.y);
    modifyPointByValue(myPoint);
    printf("After modification by value: (%d, %d)\n", myPoint.x, myPoint.y);

    // Access the point struct by reference
    printf("Before modification by reference: (%d, %d)\n", myPoint.x, myPoint.y);
    modifyPointByReference(&myPoint);
    printf("After modification by reference: (%d, %d)\n", myPoint.x, myPoint.y);

    return 0;
}