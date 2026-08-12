10 REM Sieve of Eratosthenes up to 30, using a DIM'd array (build order
20 REM step 10), FOR/NEXT (step 7), and IF/THEN (step 6).
30 LET N = 30
40 DIM ISCOMPOSITE(30)
50 FOR I = 2 TO N
60 IF ISCOMPOSITE(I) THEN 120
70 PRINT I;
80 REM FOR doesn't pre-test (see DIALECT.md) -- skip the inner loop
90 REM explicitly once I*I already exceeds N, rather than relying on it
100 IF I * I > N THEN 120
110 FOR J = I * I TO N STEP I
115 LET ISCOMPOSITE(J) = 1
118 NEXT J
120 NEXT I
