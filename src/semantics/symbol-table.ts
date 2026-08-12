// Originally sketched (build order step 15's stub) to track declared
// variables/arrays and their TypeSuffix across a Program, so the analyzer
// could look up "what type was X declared as" when checking a mismatch.
//
// Turned out unnecessary: BASIC's %/!/#/$ suffix is part of an
// identifier's own spelling (`A`, `A%`, `A$` are three distinct variables —
// see DIALECT.md), so every VariableRef/ArrayRef/LValue site's type is
// already fully recoverable from its own suffix, with no cross-reference
// tracking needed — see ast/infer-type.ts's inferExpressionType and its use
// in analyzer.ts. Left as a stub rather than building an unused table.
// Would become useful for a *different* kind of check this file was never
// actually asked to do — e.g. flagging an array used with a different
// dimension count than it was DIM'd with, which does need to remember a
// prior declaration — if that's ever wanted as a compile-time check (it's
// currently only a runtime SUBSCRIPT OUT OF RANGE error, see prelude.ts's
// __arrIndex).

export {};
