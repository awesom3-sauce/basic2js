10 REM DATA/READ/RESTORE demo (build order step 11): print a small
20 REM roster, then re-read it a second time via RESTORE to compute an
30 REM average, exercising both a fresh READ pass and a restored one.
40 DATA "Alice", 85
50 DATA "Bob", 92
60 DATA "Carol", 78
70 PRINT "ROSTER:"
80 FOR I = 1 TO 3
90 READ NAME$, SCORE
100 PRINT NAME$; ": "; SCORE
110 NEXT I
120 RESTORE
130 LET TOTAL = 0
140 FOR I = 1 TO 3
150 READ NAME$, SCORE
160 LET TOTAL = TOTAL + SCORE
170 NEXT I
180 PRINT "AVERAGE: "; TOTAL / 3
