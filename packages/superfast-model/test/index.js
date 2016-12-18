import tape from "tape";
import tapePromise from "tape-promise";
import {API,types as T} from "../src/index.js";

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
    schema: {
      foo: T.str
    },
    actions: {
      query: {
        view: "find/foo",
        include_doc: true
      },
      create: {
        validate() {},
        handle() {},
        transform() {}
      }
    },
    validate(id, opts) {},
    normalize(data, id, opts) {},
    transform(doc, opts) {}
  });

  api.listen();

  t.end();
});
