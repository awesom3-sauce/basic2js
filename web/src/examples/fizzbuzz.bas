10 REM Classic FizzBuzz, 1..15, using FOR/NEXT (build order step 7) and
20 REM IF/THEN/MOD (step 6).
30 FOR N = 1 TO 15
40 IF N MOD 15 = 0 THEN PRINT "FizzBuzz": GOTO 80
50 IF N MOD 3 = 0 THEN PRINT "Fizz": GOTO 80
60 IF N MOD 5 = 0 THEN PRINT "Buzz": GOTO 80
70 PRINT N
80 NEXT N
