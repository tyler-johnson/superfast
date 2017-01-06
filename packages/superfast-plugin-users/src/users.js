import {ValidationError} from "superfast-error";
import {Model} from "superfast";

export default function() {
  const users = new Model({
    name: "users",
    dbname: "_users",
    query: {
      view: "find/by_name",
      include_docs: true
    }
  });

  users.observe(events);

  return users;
}

const events = {
  async setup(e, db) {
    const sec = db.security();
    sec.admins.roles.add("_admin");
    sec.members.roles.add("_admin");
    await sec.save();

    const find = db.design("find");
    find.view("by_name", function(doc) {
      if (doc.type === "user") emit(doc.name, {
        rev: doc._rev,
        name: doc.name,
        roles: doc.roles
      });
    });
    await find.save();
  },
  validate(e, id) {
    if (!id || e.action === "get") return true;
    const {name} = e.userCtx;
    return name === id;
  },
  normalize(e, data) {
    if (e.action === "create") {
      if (!data.name) {
        throw new ValidationError("Missing username");
      }

      data.type = "user";
      data.roles = [];
      data._id = "org.couchdb.user:" + data.name;
    }

    return data;
  }
};