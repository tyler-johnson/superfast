import tape from "tape";
import tapePromise from "tape-promise";
import {API} from "../src/index.js";

const test = tapePromise(tape);

test("basics", async (t) => {
  const api = new API({
    version: "1.0.0"
  });

  api.model({
    name: "foobar",
    setup: async function(db) {
      const sec = db.security();
      sec.admins.roles.add("_admin");
      sec.members.roles.add("_admin");
      await sec.save();
    }
  });

  api.listen();

  t.end();
});
