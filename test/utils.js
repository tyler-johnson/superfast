import tape from "tape";
import tapePromise from "tape-promise";

export function describe(name, callback) {
  tapePromise(tape)(`START ${name}`, (testRunner) => {
    callback(function test(msg, cb) {
      testRunner.test(`${name} - ` + msg, cb);
    });

    testRunner.test(`END ${name}`, (t) => t.end());
    testRunner.end();
  });
}