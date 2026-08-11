10 REM Bubble sort over a DIM'd array (build order step 10), using
20 REM FOR/NEXT (step 7) and IF/THEN (step 6).
30 DIM A(6)
40 A(0) = 5: A(1) = 2: A(2) = 8: A(3) = 1: A(4) = 9: A(5) = 3: A(6) = 7
50 PRINT "BEFORE:"
60 FOR I = 0 TO 6
70 PRINT A(I);
80 NEXT I
90 PRINT
100 FOR I = 0 TO 5
110 FOR J = 0 TO 5 - I
120 IF A(J) <= A(J + 1) THEN 160
130 LET T = A(J)
140 LET A(J) = A(J + 1)
150 LET A(J + 1) = T
160 NEXT J
170 NEXT I
180 PRINT "AFTER:"
190 FOR I = 0 TO 6
200 PRINT A(I);
210 NEXT I
