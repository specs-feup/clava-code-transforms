#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
#include <assert.h>
#include <time.h>
#include "sdvbs_common.h"
#include "disparity.h"
#include "timingUtils.h"
I2D * readImage(char const *pathName);
void iMallocHandle(int rows, int cols, I2D **rtr_val);
unsigned int * photonStartTiming();
static void magic_timing_begin(unsigned int *cycles);
void getDisparity(I2D *Ileft, I2D *Iright, int win_sz, int max_shift, I2D **rtr_val);
void fSetArray(int rows, int cols, float val, F2D **rtr_val);
void fMallocHandle(int rows, int cols, F2D **rtr_val);
void iSetArray(int rows, int cols, int val, I2D **rtr_val);
void padarray2(I2D *inMat, I2D *borderMat, I2D **rtr_val);
void correlateSAD_2D(I2D *Ileft, I2D *Iright, I2D *Iright_moved, int win_sz, int disparity, F2D *SAD, F2D *integralImg, F2D *retSAD);
void padarray4(I2D *inMat, I2D *borderMat, int dir, I2D *paddedArray);
void computeSAD(I2D *Ileft, I2D *Iright_moved, F2D *SAD);
void integralImage2D2D(F2D *SAD, F2D *integralImg);
void finalSAD(F2D *integralImg, int win_sz, F2D *retSAD);
void iFreeHandle(I2D *out);
void findDisparity(F2D *retSAD, F2D *minSAD, I2D *retDisp, int level, int nr, int nc);
void fFreeHandle(F2D *out);
unsigned int * photonEndTiming();
void writeMatrix(I2D *input, char *inpath);
int selfCheck(I2D *in1, char *path, int tol);
unsigned int * photonReportTiming(unsigned int *startCycles, unsigned int *endCycles);
void photonPrintTiming(unsigned int *elapsed);
int main(int argc, char *argv[]);
void computeSAD(I2D *Ileft, I2D *Iright_moved, F2D *SAD) {
   int rows;
   int cols;
   int i;
   int j;
   int diff;
   rows = Ileft->height;
   cols = Ileft->width;
   for(i = 0; i < rows; i++) {
      for(j = 0; j < cols; j++) {
         diff = Ileft->data[(i) * Ileft->width + (j)] - Iright_moved->data[(i) * Iright_moved->width + (j)];
         SAD->data[(i) * SAD->width + (j)] = diff * diff;
      }
   }
   
   return;
}

void correlateSAD_2D_out0(I2D *range, int *disparity, int *rows, I2D *Iright_moved, int *cols, int *i) {
   range->data[(0) * range->width + (0)] = 0;
   range->data[(0) * range->width + (1)] = (*disparity);
   (*rows) = Iright_moved->height;
   (*cols) = Iright_moved->width;
   for((*i) = 0; (*i) < (*rows) * (*cols); (*i)++) {
      Iright_moved->data[(*i)] = 0;
   }
}

void correlateSAD_2D(I2D *Ileft, I2D *Iright, I2D *Iright_moved, int win_sz, int disparity, F2D *SAD, F2D *integralImg, F2D *retSAD) {
   int rows;
   int cols;
   int i;
   int j;
   int endRM;
   I2D *range;
   iMallocHandle(1, 2, &range);
   correlateSAD_2D_out0(range, &disparity, &rows, Iright_moved, &cols, &i);
   padarray4(Iright, range, -1, Iright_moved);
   computeSAD(Ileft, Iright_moved, SAD);
   integralImage2D2D(SAD, integralImg);
   finalSAD(integralImg, win_sz, retSAD);
   iFreeHandle(range);
   
   return;
}

void fFreeHandle_out0(int *decomp_0, F2D *out) {
   (*decomp_0) = out != ((void *) 0);
}

void fFreeHandle(F2D *out) {
   int decomp_0;
   fFreeHandle_out0(&decomp_0, out);
   if(decomp_0) {
      free(out);
   }
   
   return;
}

void fMallocHandle_out0(F2D *out, int *rows, int *cols) {
   out->height = (*rows);
   out->width = (*cols);
}

void fMallocHandle(int rows, int cols, F2D **rtr_val) {
   int i;
   int j;
   F2D *out;
   out = (F2D *) malloc(sizeof(F2D) + sizeof(float) * rows * cols);
   fMallocHandle_out0(out, &rows, &cols);
   *rtr_val = out;
   
   return;
}

void fSetArray(int rows, int cols, float val, F2D **rtr_val) {
   int i;
   int j;
   F2D *out;
   fMallocHandle(rows, cols, &out);
   for(i = 0; i < rows; i++) {
      for(j = 0; j < cols; j++) {
         out->data[(i) * out->width + (j)] = val;
      }
   }
   *rtr_val = out;
   
   return;
}

void finalSAD(F2D *integralImg, int win_sz, F2D *retSAD) {
   int endR;
   int endC;
   int i;
   int j;
   int k;
   endR = integralImg->height;
   endC = integralImg->width;
   k = 0;
   for(j = 0; j < (endC - win_sz); j++) {
      for(i = 0; i < (endR - win_sz); i++) {
         retSAD->data[(i) * retSAD->width + (j)] = integralImg->data[((win_sz + i)) * integralImg->width + ((j + win_sz))] + integralImg->data[((i + 1)) * integralImg->width + ((j + 1))] - integralImg->data[((i + 1)) * integralImg->width + ((j + win_sz))] - integralImg->data[((win_sz + i)) * integralImg->width + ((j + 1))];
      }
   }
   
   return;
}

void findDisparity(F2D *retSAD, F2D *minSAD, I2D *retDisp, int level, int nr, int nc) {
   int i;
   int j;
   int a;
   int b;
   for(i = 0; i < nr; i++) {
      for(j = 0; j < nc; j++) {
         a = retSAD->data[(i) * retSAD->width + (j)];
         b = minSAD->data[(i) * minSAD->width + (j)];
         int decomp_0;
         decomp_0 = a < b;
         if(decomp_0) {
            minSAD->data[(i) * minSAD->width + (j)] = a;
            retDisp->data[(i) * retDisp->width + (j)] = level;
         }
      }
   }
   
   return;
}

void getDisparity_out0(int *nr, I2D *Ileft, int *nc, int *half_win_sz, int *win_sz) {
   (*nr) = Ileft->height;
   (*nc) = Ileft->width;
   (*half_win_sz) = (*win_sz) / 2;
}

void getDisparity_out1(int *decomp_0, int *win_sz) {
   (*decomp_0) = (*win_sz) > 1;
}

void getDisparity_out2(int *rows, I2D *IleftPadded, int *cols) {
   (*rows) = IleftPadded->height;
   (*cols) = IleftPadded->width;
}

void getDisparity_out3(I2D ** IleftPadded, I2D *Ileft, I2D ** IrightPadded, I2D *Iright) {
   (*IleftPadded) = Ileft;
   (*IrightPadded) = Iright;
}

void getDisparity_loop0(I2D *IleftPadded, I2D *IrightPadded, I2D *Iright_moved, int *win_sz, int *k, F2D *SAD, F2D *integralImg, F2D *retSAD, F2D *minSAD, I2D *retDisp, int *nr, int *nc) {
   correlateSAD_2D(IleftPadded, IrightPadded, Iright_moved, (*win_sz), (*k), SAD, integralImg, retSAD);
   findDisparity(retSAD, minSAD, retDisp, (*k), (*nr), (*nc));
}

void getDisparity(I2D *Ileft, I2D *Iright, int win_sz, int max_shift, I2D **rtr_val) {
   I2D *Iright_moved;
   I2D *IleftPadded;
   I2D *IrightPadded;
   F2D *integralImg;
   F2D *SAD;
   F2D *minSAD;
   F2D *retSAD;
   int cols;
   int rows;
   int half_win_sz;
   I2D *halfWin;
   int k;
   int nc;
   int nr;
   I2D *retDisp;
   getDisparity_out0(&nr, Ileft, &nc, &half_win_sz, &win_sz);
   fSetArray(nr, nc, 255.0 * 255.0, &minSAD);
   iSetArray(nr, nc, max_shift, &retDisp);
   iSetArray(1, 2, half_win_sz, &halfWin);
   int decomp_0;
   getDisparity_out1(&decomp_0, &win_sz);
   if(decomp_0) {
      padarray2(Ileft, halfWin, &IleftPadded);
      padarray2(Iright, halfWin, &IrightPadded);
   }
   else {
      getDisparity_out3(&(IleftPadded), Ileft, &(IrightPadded), Iright);
   }
   getDisparity_out2(&rows, IleftPadded, &cols);
   fSetArray(rows, cols, 255, &SAD);
   fSetArray(rows, cols, 0, &integralImg);
   fMallocHandle(rows - win_sz, cols - win_sz, &retSAD);
   iSetArray(rows, cols, 0, &Iright_moved);
   for(k = 0; k < max_shift; k++) {
      getDisparity_loop0(IleftPadded, IrightPadded, Iright_moved, &win_sz, &k, SAD, integralImg, retSAD, minSAD, retDisp, &nr, &nc);
   }
   fFreeHandle(retSAD);
   fFreeHandle(minSAD);
   fFreeHandle(SAD);
   fFreeHandle(integralImg);
   iFreeHandle(halfWin);
   iFreeHandle(IrightPadded);
   iFreeHandle(IleftPadded);
   iFreeHandle(Iright_moved);
   *rtr_val = retDisp;
   
   return;
}

void iFreeHandle_out0(int *decomp_0, I2D *out) {
   (*decomp_0) = out != ((void *) 0);
}

void iFreeHandle(I2D *out) {
   int decomp_0;
   iFreeHandle_out0(&decomp_0, out);
   if(decomp_0) {
      free(out);
   }
   
   return;
}

void iMallocHandle_out0(I2D *out, int *rows, int *cols) {
   out->height = (*rows);
   out->width = (*cols);
}

void iMallocHandle(int rows, int cols, I2D **rtr_val) {
   int i;
   int j;
   I2D *out;
   out = (I2D *) malloc(sizeof(I2D) + sizeof(int) * rows * cols);
   iMallocHandle_out0(out, &rows, &cols);
   *rtr_val = out;
   
   return;
}

void iSetArray(int rows, int cols, int val, I2D **rtr_val) {
   int i;
   int j;
   I2D *out;
   iMallocHandle(rows, cols, &out);
   for(i = 0; i < rows; i++) {
      for(j = 0; j < cols; j++) {
         out->data[(i) * out->width + (j)] = val;
      }
   }
   *rtr_val = out;
   
   return;
}

void integralImage2D2D(F2D *SAD, F2D *integralImg) {
   int nr;
   int nc;
   int i;
   int j;
   nr = SAD->height;
   nc = SAD->width;
   for(i = 0; i < nc; i++) {
      integralImg->data[(0) * integralImg->width + (i)] = SAD->data[(0) * SAD->width + (i)];
   }
   for(i = 1; i < nr; i++) {
      for(j = 0; j < nc; j++) {
         integralImg->data[(i) * integralImg->width + (j)] = integralImg->data[((i - 1)) * integralImg->width + (j)] + SAD->data[(i) * SAD->width + (j)];
      }
   }
   for(i = 0; i < nr; i++) {
      for(j = 1; j < nc; j++) {
         integralImg->data[(i) * integralImg->width + (j)] = integralImg->data[(i) * integralImg->width + ((j - 1))] + integralImg->data[(i) * integralImg->width + (j)];
      }
   }
   
   return;
}

void padarray2_out0(int *rows, I2D *inMat, int *cols, int *bRows, I2D *borderMat, int *bCols, int *newRows, int *newCols) {
   (*rows) = inMat->height;
   (*cols) = inMat->width;
   (*bRows) = borderMat->data[0];
   (*bCols) = borderMat->data[1];
   (*newRows) = (*rows) + (*bRows) * 2;
   (*newCols) = (*cols) + (*bCols) * 2;
}

void padarray2(I2D *inMat, I2D *borderMat, I2D **rtr_val) {
   int j;
   int i;
   I2D *paddedArray;
   int newCols;
   int newRows;
   int bCols;
   int bRows;
   int cols;
   int rows;
   padarray2_out0(&rows, inMat, &cols, &bRows, borderMat, &bCols, &newRows, &newCols);
   iSetArray(newRows, newCols, 0, &paddedArray);
   for(i = 0; i < rows; i++) {
      for(j = 0; j < cols; j++) {
         paddedArray->data[((bRows + i)) * paddedArray->width + ((bCols + j))] = inMat->data[(i) * inMat->width + (j)];
      }
   }
   *rtr_val = paddedArray;
   
   return;
}

void padarray4(I2D *inMat, I2D *borderMat, int dir, I2D *paddedArray) {
   int rows;
   int cols;
   int bRows;
   int bCols;
   int newRows;
   int newCols;
   int i;
   int j;
   int adir;
   adir = abs(dir);
   rows = inMat->height;
   cols = inMat->width;
   bRows = borderMat->data[0];
   bCols = borderMat->data[1];
   newRows = rows + bRows;
   newCols = cols + bCols;
   int decomp_0;
   decomp_0 = dir == 1;
   if(decomp_0) {
      for(i = 0; i < rows; i++) {
         for(j = 0; j < cols; j++) {
            paddedArray->data[(i) * paddedArray->width + (j)] = inMat->data[(i) * inMat->width + (j)];
         }
      }
   }
   else {
      for(i = 0; i < rows - bRows; i++) {
         for(j = 0; j < cols - bCols; j++) {
            paddedArray->data[((bRows + i)) * paddedArray->width + ((bCols + j))] = inMat->data[(i) * inMat->width + (j)];
         }
      }
   }
   
   return;
}

static void magic_timing_begin(unsigned int *cycles) {
   struct timespec ts;
   clock_gettime(4, &ts);
   cycles[0] = ts.tv_nsec;
   cycles[1] = ts.tv_sec;
}

unsigned int * photonEndTiming() {
   unsigned int *array;
   array = (unsigned int *) malloc(sizeof(unsigned int) * 2);
   magic_timing_begin(array);
   
   return array;
}

void photonPrintTiming(unsigned int *elapsed) {
   if(elapsed[1] == 0) {
      printf("Cycles elapsed\t\t- %u\n\n", elapsed[0]);
   }
   else {
      printf("Cycles elapsed\t\t- %u%u\n\n", elapsed[1], elapsed[0]);
   }
}

unsigned int * photonReportTiming(unsigned int *startCycles, unsigned int *endCycles) {
   unsigned int *elapsed;
   elapsed = (unsigned int *) malloc(sizeof(unsigned int) * 2);
   unsigned long long start = (((unsigned long long) 0x0) | startCycles[0]) << 32 | startCycles[1];
   unsigned long long end = (((unsigned long long) 0x0) | endCycles[0]) << 32 | endCycles[1];
   unsigned long long diff = end - start;
   elapsed[0] = (unsigned int) (diff >> 32);
   elapsed[1] = (unsigned int) (diff & 0xffffffff);
   
   return elapsed;
}

unsigned int * photonStartTiming() {
   unsigned int *array;
   array = (unsigned int *) malloc(sizeof(unsigned int) * 2);
   magic_timing_begin(array);
   
   return array;
}

I2D * readImage(char const *pathName) {
   char signature[2];
   int file_size;
   short reserved1;
   short reserved2;
   int loc_of_bitmap;
   int size_of_infoheader;
   int width;
   int height;
   short number_of_planes;
   short bits_per_pixel;
   int compression_method;
   int bytes_of_bitmap;
   int hori_reso;
   int vert_reso;
   int no_of_colors;
   int no_of_imp_colors;
   int nI, nJ;
   int pixSize;
   unsigned char tempb;
   unsigned char tempg;
   unsigned char tempr;
   unsigned char tempjunk[12];
   int ta;
   I2D *srcImage;
   FILE *input;
   input = fopen(pathName, "rb");
   if(input == ((void *) 0)) {
      perror("File pointer error");
      
      return ((void *) 0);
   }
   else {
      fread(&signature, sizeof((((((signature)))))), 1, input);
      fread(&file_size, sizeof((((((file_size)))))), 1, input);
      fread(&reserved1, sizeof((((((reserved1)))))), 1, input);
      fread(&reserved2, sizeof((((((reserved2)))))), 1, input);
      fread(&loc_of_bitmap, sizeof((((((loc_of_bitmap)))))), 1, input);
      fread(&size_of_infoheader, sizeof((((((size_of_infoheader)))))), 1, input);
      fread(&width, sizeof((((((width)))))), 1, input); // Reads the width of the image
      fread(&height, sizeof((((((height)))))), 1, input); // Reads the height of the image
      fread(&number_of_planes, sizeof((((((number_of_planes)))))), 1, input);
      fread(&bits_per_pixel, sizeof((((((bits_per_pixel)))))), 1, input);
      fread(&compression_method, sizeof((((((compression_method)))))), 1, input);
      fread(&bytes_of_bitmap, sizeof((((((bytes_of_bitmap)))))), 1, input);
      fread(&hori_reso, sizeof((((((hori_reso)))))), 1, input);
      fread(&vert_reso, sizeof((((((vert_reso)))))), 1, input);
      fread(&no_of_colors, sizeof((((((no_of_colors)))))), 1, input);
      fread(&no_of_imp_colors, sizeof((((((no_of_imp_colors)))))), 1, input);
      iMallocHandle(height, width, &srcImage);
      if(srcImage->height <= 0 || srcImage->width <= 0 || signature[0] != 'B' || signature[1] != 'M' || (bits_per_pixel != 24 && bits_per_pixel != 8)) {
         printf("ERROR in BMP read: The input file is not in standard BMP format");
         
         return ((void *) 0);
      }
      fseek(input, loc_of_bitmap, 0);
      if(bits_per_pixel == 8) {
         for(nI = (height - 1); nI >= 0; nI--) {
            for(nJ = 0; nJ < width; nJ++) {
               fread(&tempg, sizeof(unsigned char), 1, input);
               srcImage->data[(nI) * srcImage->width + (nJ)] = (int) tempg;
            }
         }
      }
      else {
         if(bits_per_pixel == 24) {
            for(nI = (height - 1); nI >= 0; nI--) {
               for(nJ = 0; nJ < width; nJ++) {
                  fread(&tempb, sizeof(unsigned char), 1, input);
                  fread(&tempg, sizeof(unsigned char), 1, input);
                  fread(&tempr, sizeof(unsigned char), 1, input);
                  ta = (3 * tempr + 6 * tempg + tempb) / 10;
                  ta = tempg;
                  srcImage->data[(nI) * srcImage->width + (nJ)] = (int) ta;
               }
            }
         }
         else {
            
            return ((void *) 0);
         }
      }
      fclose(input);
      
      return srcImage;
   }
}

int main(int argc, char *argv[]) {
   int rows = 32;
   int cols = 32;
   I2D *imleft, *imright, *retDisparity;
   unsigned int *start, *endC, *elapsed;
   int i, j;
   char im1[100];
   char im2[100];
   char timFile[100];
   int WIN_SZ = 8, SHIFT = 64;
   FILE *fp;
   if(argc < 2) {
      printf("We need input image path and output path\n");
      
      return -1;
   }
   sprintf(im1, "%s/1.bmp", argv[1]);
   sprintf(im2, "%s/2.bmp", argv[1]);
   imleft = readImage(im1);
   imright = readImage(im2);
   rows = imleft->height;
   cols = imleft->width;
   start = photonStartTiming();
   getDisparity(imleft, imright, WIN_SZ, SHIFT, &retDisparity);
   endC = photonEndTiming();
   printf("Input size\t\t- (%dx%d)\n", rows, cols);
   int _scope0_tol, _scope0_ret = 0;
   _scope0_tol = 2;
   writeMatrix(retDisparity, argv[1]);
   _scope0_ret = selfCheck(retDisparity, argv[1], _scope0_tol);
   if(_scope0_ret == -1) {
      printf("Error in Disparity Map\n");
   }
   elapsed = photonReportTiming(start, endC);
   photonPrintTiming(elapsed);
   iFreeHandle(imleft);
   iFreeHandle(imright);
   iFreeHandle(retDisparity);
   free(start);
   free(endC);
   free(elapsed);
   
   return 0;
}

int selfCheck(I2D *in1, char *path, int tol) {
   int r1, c1, ret = 1;
   FILE *fd;
   int count = 0;
   int *buffer;
   int i;
   int j;
   char file[100];
   int *data = in1->data;
   r1 = in1->height;
   c1 = in1->width;
   buffer = (int *) malloc(sizeof(int) * r1 * c1);
   sprintf(file, "%s/expected_C.txt", path);
   fd = fopen(file, "r");
   if(fd == ((void *) 0)) {
      printf("Error: Expected file not opened \n");
      
      return -1;
   }
   while(!feof(fd)) {
      fscanf(fd, "%d", &buffer[count]);
      count++;
   }
   count--;
   if(count < (r1 * c1)) {
      printf("Checking error: dimensions mismatch. Expected = %d, Observed = %d \n", count, (r1 * c1));
      
      return -1;
   }
   for(i = 0; i < r1 * c1; i++) {
      if((abs(data[i]) - abs(buffer[i])) > tol || (abs(buffer[i]) - abs(data[i])) > tol) {
         printf("Checking error: Values mismtach at %d element\n", i);
         printf("Expected value = %d, observed = %d\n", buffer[i], data[i]);
         
         return -1;
      }
   }
   fclose(fd);
   free(buffer);
   printf("Verification\t\t- Successful\n");
   
   return ret;
}

void writeMatrix(I2D *input, char *inpath) {
   FILE *fp;
   char im[100];
   int rows, cols, i, j;
   sprintf(im, "%s/expected_C.txt", inpath);
   fp = fopen(im, "w");
   rows = input->height;
   cols = input->width;
   for(i = 0; i < rows; i++) {
      for(j = 0; j < cols; j++) {
         fprintf(fp, "%d\t", input->data[(i) * input->width + (j)]);
      }
      fprintf(fp, "\n");
   }
   fclose(fp);
}
