import {ValidationError} from "superfast-error";
import {Model} from "superfast";

export default function() {
  const users = new Model({
    name: "users",
    couchdb: true,
    dbname: "_users",
    query: {
      view: "find/by_name"
    }
  });

  users.observe(events);

  return users;
}

const events = {
  async setup() {
    const find = this.db.design("find");
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
    // all create, get and query are allowed
    if (["get","query","create"].includes(e.action)) return true;
    
    // writes only allowed on own user doc
    return e.userCtx && id ? e.userCtx.name === id : false;
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