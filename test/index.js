var test = require("tape");

test("loads superfast", function(t) {
	t.plan(1);
	require("../");
	t.pass("loaded superfast");
});
