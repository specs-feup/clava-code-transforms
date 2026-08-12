#include <stdio.h>

int main(void) {
    int arr[3] = {1, 2, 3};
    int accum = 0;
    
    for (int i = 0; i < 3; i++) {
        accum += 2 * arr[i];
    }
    
    printf("%d\n", accum);
}