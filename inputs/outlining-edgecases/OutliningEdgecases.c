#include <stdio.h>
#include <math.h>

void intenseArithmeticFunction()
{
    int a = 1, b = 2, c = 3, d = 4, e = 5;
    long long sum = 0;
    double result = 0.0;

    for (int i = 1; i <= 500; i++)
    {
        a = (a + b * c - d) % 1000;
        b = (b * 3 + a - e * 2) % 1000;
        c = (c + b / (a + 1)) % 1000;
        d = (d + c * b - a / 2) % 1000;
        e = (e * 5 + d - c) % 1000;

        sum += a + b + c + d + e;

        if ((i % 50) == 0)
        {
            result += sqrt((double)(sum % 1000));
        }

        for (int j = 1; j <= 100; j++)
        {
            a = (a * j + 7) % 123;
            b = (b + j * 2 - a) % 321;
            c = (c ^ (a + b)) % 213;
            d = (d | (b - c)) % 432;
            e = (e & (c + d)) % 341;

#pragma clava begin_outline funA
            sum += a * b - c + d / (e + 1);

            if (j % 33 == 0)
            {
                continue; // occasional skip
            }
            if (j % 17 == 0)
            {
                a = (a + b - c * d + e) % 1000; // special case
                break;
            }

            for (int k = 1; k <= 20; k++)
            {
                int temp = (a * b + c - d * e + k) % 10000;
                sum += temp;
                result += (double)(temp % (k + 1)) * 0.75;

                if (k == 19 && j == 99)
                {
                    break; // just one rare break
                }

                a += (temp % 3) - (k % 2);
                b -= (temp % 4) + (j % 3);
                c += (a * b - k) % 7;
                d = (d + c - e) ^ (temp % 256);
                e = (e * 2 + a - b) % 500;

                result += (double)(a + b + c + d + e) / (k + 1);
            }
#pragma clava end_outline funA

            sum += a + b + c + d + e;
        }

        result += sin(a) + cos(b) + tan(c % 90) + log((double)(d + 100));
    }

    sum += a * b + c - d + e;
    result += (double)sum / 3.1415;

    printf("Final sum: %lld\n", sum);
    printf("Final result: %f\n", result);
}