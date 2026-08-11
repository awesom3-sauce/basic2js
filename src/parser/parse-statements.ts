// Statement parsing — one parse function per Statement kind, dispatched by
// leading keyword.
//
// TODO (build order steps 2, 6-13, incrementally: PRINT/LET/GOTO first, then
// IF/FOR/GOSUB/ON/INPUT/DIM/DATA/WHILE/DEF FN as each stage lands): export
// one parseXStmt function per statement kind, plus a parseStatement dispatcher
// used by parser.ts within a colon-separated statement list.

export {};
