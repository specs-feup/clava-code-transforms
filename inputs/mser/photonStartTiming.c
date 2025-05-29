/********************************
Author: Sravanthi Kota Venkata
********************************/
#define _POSIX_C_SOURCE 199309L

/** C File **/
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <math.h>
#include <time.h>
#include "timingUtils.h"
#include "sdvbs_common.h"

static void magic_timing_begin(unsigned int *cycles)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC_RAW, &ts);
    cycles[0] = ts.tv_nsec;
    cycles[1] = ts.tv_sec;
}

unsigned int *photonStartTiming()
{
    unsigned int *array;

    array = (unsigned int *)malloc(sizeof(unsigned int) * 2);
    magic_timing_begin(array);
    return array;
}

/** End of C Code **/
