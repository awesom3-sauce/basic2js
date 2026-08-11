10 REM Fahrenheit <-> Celsius converter, using INPUT (build order step 9)
20 REM and IF/THEN (step 6).
30 PRINT "1) Fahrenheit to Celsius"
40 PRINT "2) Celsius to Fahrenheit"
50 INPUT "Choose an option"; CHOICE
60 IF CHOICE = 1 THEN 100
70 IF CHOICE = 2 THEN 200
80 PRINT "Invalid option"
90 END
100 INPUT "Degrees Fahrenheit"; F
110 LET C = (F - 32) * 5 / 9
120 PRINT F; "F = "; C; "C"
130 END
200 INPUT "Degrees Celsius"; C
210 LET F = C * 9 / 5 + 32
220 PRINT C; "C = "; F; "F"
