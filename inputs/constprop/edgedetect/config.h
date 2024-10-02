#pragma once

// Universal params
#define ITER 0 // 1000

#define K 3
#define N 512 // 128
#define T 50  // 127

#define H N
#define W N

#define CONV_SMOOTH 0
#define CONV_VERT 1
#define CONV_HORIZ 2

#define CHECKSUM 259845 // for 512x512, K = 3, T = 80

// Version-specific params
#ifndef SCENARIO
#define SCENARIO V0CE
#endif

#define V0 1
#define V0C 2
#define V0CE 3
#define V0E 4
#define V1 5
#define V1C 6
#define V1CE 7
#define V1E 8
#define V2 9
#define V2C 10
#define V2CE 11
#define V2E 12

#if SCENARIO == V0
#define MAIN_ALL
#define SET_FILTER
#endif

#if SCENARIO == V0C
#define MAIN_ALL
#endif

#if SCENARIO == V0CE
#endif

#if SCENARIO == V0E
#define SET_FILTER
#endif