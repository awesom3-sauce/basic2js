10 REM Classic FizzBuzz, 1..15. Written with GOTO/IF (not FOR/NEXT --
20 REM that's build order step 7) since this only needs step 6's features.
30 LET N = 1
40 IF N MOD 15 = 0 THEN PRINT "FizzBuzz": GOTO 100
50 IF N MOD 3 = 0 THEN PRINT "Fizz": GOTO 100
60 IF N MOD 5 = 0 THEN PRINT "Buzz": GOTO 100
70 PRINT N
100 LET N = N + 1
110 IF N <= 15 THEN 40
