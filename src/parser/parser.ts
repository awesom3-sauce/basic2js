// Parser orchestrator: Token[] -> Program AST.
//
// TODO (build order step 2): export function parse(tokens: Token[]): Program
// - Group tokens into lines by leading line-number token.
// - Split each line's remaining tokens on ':' into statements, delegating to
//   parse-statements.ts's parseStatement for each.
// - Sort Line[] by lineNumber; duplicate line numbers should raise a
//   ParseError (classic BASIC listings don't allow them).
// - Colocate parser.test.ts here with one describe block per statement/
//   expression kind, per CLAUDE.md testing conventions.

export {};
