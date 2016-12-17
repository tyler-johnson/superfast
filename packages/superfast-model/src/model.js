import {check,isValid} from "./utils/check.js";
import CouchDB from "./couchdb";
import {splitPathname} from "./utils/url";

export default class Model {
  constructor(conf={}) {
    this.name = check(conf.name, ["string","truthy"], "Expecting non-empty string for model name.");
    this.actions = ["setup","query","get","normalize","validate"].reduce((m, n) => {
      if (isValid(conf[n], "function")) m[n] = conf[n];
      return m;
    }, {});
    this.conf = conf;
  }

  init(api) {
    const {database} = this.conf;

    this.api = api;
    let db;

    if (database && typeof database === "string") {
      db = this.api.couchdbs.findById(database);
    } else if (database instanceof CouchDB) {
      db = database;
    } else {
      db = this.api.couchdbs.meta;
    }

    this.couchdb = db;
    this.pouchdb = db.createPouchDB(this.name);

    db.setup(async () => {
      try {
        await db.request("PUT", this.name);
      } catch(e) {
        if (e.status !== 412) throw e;
      }

      if (this.actions.setup) await this.actions.setup(this.pouchdb);
    });
  }

  handle = async (req, res, next) => {
    const segments = splitPathname(req.url);
    if (segments[0] !== this.name || segments.length > 2) return next();

    const id = segments[1];
    const type = req.method === "GET" ? id ? "read" : "query" :
      req.method === "POST" && !id ? "create" :
      req.method === "PUT" && id ? "update" :
      req.method === "DELETE" ? "delete" : null;

    if (type == null) return next();

    switch (type) {
      case "query":
        res.send(await this.query(req.params));
        break;
      default:
        return next();
    }
  }

  validate(type, id, params) {
    if (this.actions.validate && !this.actions.validate(type, id, params)) {
      throw new Error("Invalid request");
    }
  }

  async query(params) {
    let out;

    this.validate("query", null, params);

    if (this.actions.query) {
      const rows = await this.actions.query.call(this, this.pouchdb, params);
      if (Array.isArray(rows)) out = { rows };
      else if (rows != null && Array.isArray(rows.rows)) out = rows;
      else out = { rows: [] };
    } else {
      const {total_rows,rows} = await this.pouchdb.allDocs({
        include_docs: true
      });

      out = {
        rows: rows.map(r => r.doc),
        total_rows
      };
    }

    if (out.total_rows == null) {
      out.total_rows = out.rows.length;
    }

    return out;
  }
}
