import CouchDB from "./couchdb";
import * as actions from "./actions";

function setup(event) {
  if (this._setup) return Promise.resolve();
  if (this._settingup) return this._settingup;
  return (this._settingup = (async () => {
    await this.couch.load();

    try {
      await this.couch.request("PUT", this.dbname);
    } catch(e) {
      if (e.status !== 412) throw e;
    }

    await event.reduce((m, fn, ob) => {
      return fn.call(ob, event);
    });
  })());
}

export default function(model) {
  const backend = this.backend("couchdb");
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
  model.dbname = model.conf.dbname || model.name;
  model.db = couch.createPouchDB(model.dbname);
  model.action(actions);
  model.registerEventHandler("setup", setup);
}