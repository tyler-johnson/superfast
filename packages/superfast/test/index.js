import tape from "tape";
import tapePromise from "tape-promise";

const superfast = require("./").default;
const test = tapePromise(tape);

test("creates an api", (t) => {
  const api = superfast();
  t.ok(api, "made an api");
  t.end();
});