# Bundled examples

Sample `.bas` programs shown in the `ExamplesMenu` component, mirroring
`tests/golden/programs/`. Populate this directory in build-order step 18
(each program added as its required language features land), keeping each
sample's source text identical to its golden-test counterpart so the web UI
and the test suite never drift apart — consider a small build-time or
test-time check that asserts the two stay in sync.
