import {check,isValid} from "./utils/check.js";
import CouchDB from "./couchdb";
import {splitPathname} from "./utils/url";
import Context from "./context";

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
    let couch;

    if (database && typeof database === "string") {
      couch = this.api.couchdbs.findById(database);
    } else if (database instanceof CouchDB) {
      couch = database;
    } else {
      couch = this.api.couchdbs.meta;
    }

    this.couch = couch;
    this.db = couch.createPouchDB(this.name);

    couch.setup(async () => {
      try {
        await couch.request("PUT", this.name);
      } catch(e) {
        if (e.status !== 412) throw e;
      }

      await this.action("setup");
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

    const {params,user} = req;
    const ctx = {id,params,user};

    switch (type) {
      case "query":
        res.send(await this.query(ctx));
        break;
      default:
        return next();
    }
  }

  static actions = {
    async query() {
      const {total_rows,rows} = await this.db.allDocs({
        include_docs: true
      });

      return {
        rows: rows.map(r => r.doc),
        total_rows
      };
    }
  };

  async context(data) {
    return new Context(this, data);
  }

  async action(name, ctx, ...args) {
    if (!(ctx instanceof Context)) ctx = this.context(ctx);

    let fn;
    if (this.actions[name]) fn = this.actions[name];
    else if (Model.actions[name]) fn = Model.actions[name];
    
    if (fn) return await fn.call(this, ctx, ...args);
  }

  async validate(ctx, type) {
    if (!(ctx instanceof Context)) ctx = this.context(ctx);
    if (!(await this.action("validate", ctx, type))) {
      throw new Error(`Invalid ${type} request`);
    }

    return ctx;
  }

  async query(ctx) {
    ctx = await this.validate(ctx, "query");
    const rows = await this.action("query", ctx);
    
    let out;
    if (Array.isArray(rows)) out = { rows };
    else if (rows != null && Array.isArray(rows.rows)) out = rows;
    else out = { rows: [] };

    if (out.total_rows == null) {
      out.total_rows = out.rows.length;
    }

    return out;
  }
}
