#include <stdio.h>

int main(void) {
    int accum = 0;
    
    for (int i = 0; i < 10; i++) {
        accum += 2;
    }
    
    printf("%d\n", accum);
}