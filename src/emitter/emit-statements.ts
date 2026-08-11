// Step -> JS `case N: ... ; break;` emission, one function per Step kind.
//
// TODO (build order step 4, expanded through steps 6-13; see the plan file's
// "Dispatch-Loop / Virtual-PC Execution Model" section for the illustrative
// shape): each Step becomes one switch case in the generated run() function.
// Only INPUT steps contain `await`. Every case sets `__line` first (for
// error reporting) before its statement logic.

export {};
