import CouchDB from "./couchdb";
import * as actions from "./actions";

function setup() {
  if (this._setup) return Promise.resolve();
  if (this._settingup) return this._settingup;
  return (this._settingup = this.fire("setup"));
}

async function setupEvent() {
  await this.couch.load();

  try {
    await this.couch.request("PUT", this.dbname);
  } catch(e) {
    if (e.status !== 412) throw e;
  }
}

export default function(model) {
  const {couchdb} = model.conf;
  if (!couchdb) return;

  const backend = this.backend("couchdb");
  let couch;

  if (couchdb && typeof couchdb === "string") {
    couch = backend.findById(couchdb);
  } else if (CouchDB.isCouchDB(couchdb)) {
    couch = couchdb;
  }

  if (couch == null) {
    couch = backend.meta;
  }

  model.backend = backend;
  model.couch = couch;
  model.dbname = model.conf.dbname || model.name;
  model.db = couch.createPouchDB(model.dbname);

  model.action(actions);
  model.setup = setup;
  model.observe("setup", setupEvent);
}