/* globals emit */

const {API} = require("./packages/superfast");
const couchdbPlugin = require("./packages/superfast-plugin-couchdb");
const usersPlugin = require("./packages/superfast-plugin-couchdb-users");
const httpPlugin = require("./packages/superfast-plugin-httpserver");
const authPlugin = require("./packages/superfast-plugin-authenticate");

const api = new API();
api.use(httpPlugin());
api.use(authPlugin());
api.use(couchdbPlugin());
api.use(usersPlugin());

api.observe("response", function(e, data) {
  return Object.assign({ ok: true }, data);
});

const Foo = api.model({
  name: "foo",
  couchdb: true,
  query: {
    view: "find/foo"
  }
});

Foo.observe("setup", async function() {
  const sec = this.db.security();
  sec.admins.roles.add("_admin");
  sec.members.roles.add("_admin");
  await sec.save();

  const find = this.db.design("find");
  find.view("foo", function(doc) {
    emit(doc.foo, { id: doc.foo, oldId: doc._id });
  });
  await find.save();
});

const server = api.listen(() => {
  console.log("listening on port %s", server.address().port);
});