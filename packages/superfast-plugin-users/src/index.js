import {ValidationError,UnauthorizedError} from "superfast-error";

export default function(api) {
  api.users = api.model({
    name: "users",
    dbname: "_users",
    query: {
      view: "find/by_name",
      include_docs: true,
      // key(id) {
      //   console.log(arguments);
      //   return id;
      // }
    },
    events: {
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
    }
  });

  api.registerAuth(async (auth, next) => {
    if (typeof auth !== "string" ||
      auth.substr(0, 6).toLowerCase() !== "basic ") return next();

    try {
      const {body} = await api.users.couch.request("GET", "/_session")
        .set("Authorization", auth);

      return body.userCtx;
    } catch(e) {
      throw new UnauthorizedError("Invalid username or password");
    }
  });
}
