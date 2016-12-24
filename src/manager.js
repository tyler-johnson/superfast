import CouchDB from "./couchdb";
import {Router} from "express";
import {parse} from "url";
import {find} from "lodash";

export default class CouchDBManager {
  constructor(conf={}) {
    const { databases, couchdb, version } = conf;
    const hasDatabases = Array.isArray(databases) && databases.length;

    this.version = version;
    this.databases = [];
    this.cores = [];
    this.meta = this._registerCouchDB(couchdb, hasDatabases);

    if (hasDatabases) {
      databases.forEach(db => {
        this.cores.push(this._registerCouchDB(db, false));
      });
    } else {
      this.cores.push(this.meta);
    }
  }

  _registerCouchDB(conf, privateOnly) {
    const couchdb = new CouchDB(conf, {
      privateOnly,
      authenticate: this.authenticate,
      version: this.version
    });
    this.databases.push(couchdb);
    return couchdb;
  }

  load() {
    return Promise.all(this.databases.map(db => db.load()));
  }

  router() {
    const router = new Router();

    router.use("/:dbid", (req, res, next) => {
      const db = this.findById(req.params.dbid);
      if (db && db.proxy) return db.proxy(req, res, next);
      next();
    });

    return router;
  }

  metadb(dbname, opts) {
    return this.meta.createPouchDB(dbname, opts);
  }

  findByUrl(url) {
    if (url == null) return null;
    if (typeof url === "string") {
      url = parse(url, false, true);
    }

    return find(this.databases, db => {
      return db.testUrl(url);
    });
  }

  findById(id) {
    return find(this.databases, db => {
      return db.id === id;
    });
  }

  async allocate(dbname, opts) {
    const couchdb = await this.lowest();
    return couchdb.createPouchDB(dbname, opts);
  }

  async lowest() {
    let dbs = this.cores;
    if (dbs.length === 1) return dbs[0];

    let best, size;
    for (let i = 0; i < dbs.length; i++) {
      let db = dbs[i];
      let s = await db.size();
      if (size == null || s < size) [best,size] = [db,s];
    }

    return best;
  }
}