#pragma once

#include "config.h"

void input_dsp(int buf[H * W * 3]);

int checksum(int buf[H * W]);

void output_dsp(int buf[H * W], char *name);

void output_dsp_rgb(int buf[H * W * 3], char *name);
