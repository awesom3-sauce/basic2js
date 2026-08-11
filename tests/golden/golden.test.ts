// Golden-file integration test harness.
//
// TODO (build order step 18, interleaved with feature stages — add each
// program's test as soon as the features it needs exist, don't batch at the
// end): for each subdirectory under ./programs/, read program.bas (+
// input.txt if present) and expected.txt, compile + run the program against
// a scripted TestRuntime (see ../helpers/test-runtime.ts), and assert the
// captured print output matches expected.txt exactly.

import { it } from "vitest";

it.todo("golden fixtures — see CLAUDE.md's staged build order step 18");
