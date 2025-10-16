#ifndef _DISPARITY_H_
#define _DISPARITY_H_

#include "sdvbs_common.h"
void computeSAD(I2D *Ileft, I2D *Iright_moved, F2D *SAD);
void getDisparity(I2D *Ileft, I2D *Iright, int win_sz, int max_shift, I2D **rtr_val);
void finalSAD(F2D *integralImg, int win_sz, F2D *retSAD);
void findDisparity(F2D *retSAD, F2D *minSAD, I2D *retDisp, int level, int nr, int nc);
void integralImage2D2D(F2D *SAD, F2D *integralImg);
void correlateSAD_2D(I2D *Ileft, I2D *Iright, I2D *Iright_moved, int win_sz, int disparity, F2D *SAD, F2D *integralImg, F2D *retSAD);
void padarray2(I2D *inMat, I2D *borderMat, I2D **rtr_val);
void padarray4(I2D *inMat, I2D *borderMat, int dir, I2D *paddedArray);
#endif
