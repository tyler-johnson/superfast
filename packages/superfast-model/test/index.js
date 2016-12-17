import tape from "tape";
import tapePromise from "tape-promise";
import {API} from "../src/index.js";

const test = tapePromise(tape);

test("basics", async (t) => {
  const api = new API({
    version: "1.0.0",
    couchdb: {
      version: "^1.0.0"
    }
  });

  api.model({
    name: "foobar",
    async setup() {
      const sec = this.db.security();
      sec.admins.roles.add("_admin");
      sec.members.roles.add("_admin");
      await sec.save();
    },
    validate(ctx, type) {
      console.log(type);
      return false;
    }
  });

  api.listen();

  t.end();
});
