import {check,isValid} from "./utils/check.js";
import CouchDB from "./couchdb";
import {splitPathname} from "./utils/url";

export default class Model {
  constructor(conf={}) {
    this.name = check(conf.name, ["string","truthy"], "Expecting non-empty string for model name.");
    this.setup = check(conf.setup, { $or: ["function","empty"] }, "Expecting function for setup.");
    this.retrieve = {};
    if (isValid(conf.query, "function")) this.retrieve.query = conf.query;
    if (isValid(conf.get, "function")) this.retrieve.get = conf.get;
    this.normalize = check(conf.normalize, { $or: ["function","empty"] }, "Expecting function for normalize.");
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

      if (this.setup) await this.setup(this.pouchdb);
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

  async query(params, user) {
    let out;

    if (this.retrieve.query) {
      const rows = await this.retrieve.query(params, user);

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
