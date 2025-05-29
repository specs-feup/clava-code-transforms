# Benchmark-specific definitions
APP = disparity
DEFAULT_INPUT = sim_fast

# General rules for any CortexSuite-Vision benchmark
ELF=$(APP).elf
CC = clang
CFLAGS = -Wall -O3
LDFLAGS = -lm
SRC = $(wildcard *.c)
OBJ = $(SRC:.c=.o)
INPUT ?= $(DEFAULT_INPUT)

# Targets
all: $(ELF)

$(ELF):
	$(CC) $(CFLAGS) $(LDFLAGS) -o $(ELF) $(SRC)

run: $(ELF)
	@/usr/bin/time -f "Time:\n  real: %e sec\n  user: %U sec\n  sys:  %S sec" ./$(ELF) data/$(INPUT)

clean:
	rm -f $(ELF)
