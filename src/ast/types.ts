// Shared AST primitive types. See DIALECT.md's "Type-suffix semantics"
// section for what each suffix means.

/** BASIC's variable type suffixes. `""` = untyped, defaults to single precision. */
export type TypeSuffix = "%" | "!" | "#" | "$" | "";

/** The runtime value shapes a BASIC expression can evaluate to. */
export type BasicValue = number | string;
