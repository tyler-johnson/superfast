import Model from "../model";
import T from "kontur";
import {UnauthorizedError} from "../error";
import {randomBytes} from "crypto";

const conf = {
  name: "tokens",
  dbname: "tokens",
  schema: {
    user: T.str,
    label: T.str.optional,
    token: T.str
  },
  events: {
    async setup(e, db) {
      const sec = db.security();
      sec.admins.roles.add("_admin");
      sec.members.roles.add("_admin");
      await sec.save();
    },
    async normalize(e, data) {
      const {label} = data;
      const res = {label};

      if (e.action === "create") {
        if (!e.userCtx || !e.userCtx.name) {
          throw new UnauthorizedError("Only authenticated users can create tokens.");
        }

        res.user = e.userCtx.name;
        res.token = randomBytes(32).toString("hex");
      }

      return res;
    }
  }
};

export default function() {
  return new Model(conf);
}
