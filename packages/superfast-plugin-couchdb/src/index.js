import Backend from "./backend";
import CouchDB from "./couchdb";

function initModel(backend, model) {
  const {database} = model.conf;
  let couch;

  if (database && typeof database === "string") {
    couch = backend.findById(database);
  } else if (CouchDB.isCouchDB(database)) {
    couch = database;
  }

  if (couch == null) {
    couch = backend.meta;
  }

  model.couch = couch;
  const dbname = model.dbname = model.conf.dbname || model.name;
  model.db = couch.createPouchDB(dbname);

  couch.setup(async () => {
    try {
      await couch.request("PUT", dbname);
    } catch(e) {
      if (e.status !== 412) throw e;
    }

    await model.fire("setup", model.db);
  });
}

export default function(conf) {
  const backend = new Backend(conf);

  return function(api) {
    api.couchdbs = backend;
    api.on("model", (m) => initModel(backend, m));
    api.observe("load", () => backend.load());
  };
}
