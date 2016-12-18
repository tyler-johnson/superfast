import {check,isValid} from "./utils/check.js";
import CouchDB from "./couchdb";
import {splitPathname} from "./utils/url";
import {compile} from "kontur";
import Ajv from "ajv";

export default class Model {
  static actions = {
    query: {
      async handle(action, opts={}) {
        const {view,include_docs,descending,key,keys} = action;
        const {limit,skip} = opts;

        const qopts = {
          include_docs: !view || include_docs,
          descending, limit, skip,
          key: typeof key === "function" ? key(opts) : void 0,
          keys: typeof keys === "function" ? keys(opts) : void 0
        };

        const {total_rows,rows} = await (view ? this.db.query(view, qopts) : this.db.allDocs(qopts));

        return {
          total_rows,
          rows: rows.map(r => !view || include_docs ? r.doc : r.value)
        };
      }
    }
  };

  constructor(conf={}) {
    this.conf = conf;
    this.name = check(conf.name, ["string","truthy"], "Expecting non-empty string for model name.");
    
    if (conf.actions) {
      check(conf.actions, "object", "Expecting object or null for actions.");
      this.registerAction(conf.actions);
    }

    if (conf.schema) {
      const ajv = new Ajv({
        useDefaults: true,
        removeAdditional: "all"
      });

      this.schema = ajv.compile(compile(conf.schema));
    }

    if (isValid(conf.setup, "function")) this._setup = conf.setup;
    if (isValid(conf.validate, "function")) this._validate = conf.validate;
    if (isValid(conf.normalize, "function")) this._normalize = conf.normalize;
    if (isValid(conf.transform, "function")) this._transform = conf.transform;
  }

  init(api) {
    const {database} = this.conf;
    let couch;

    if (database && typeof database === "string") {
      couch = api.couchdbs.findById(database);
    } else if (database instanceof CouchDB) {
      couch = database;
    }
    
    if (couch == null) {
      couch = api.couchdbs.meta;
    }

    this.api = api;
    this.couch = couch;
    this.db = couch.createPouchDB(this.name);

    couch.setup(async () => {
      try {
        await couch.request("PUT", this.name);
      } catch(e) {
        if (e.status !== 412) throw e;
      }

      await this._setup(this.db);
    });
  }

  async handle(req, res, next) {
    const segments = splitPathname(req.path);
    if (segments[0] !== this.name || segments.length > 2) return next();

    const id = segments[1];
    const type = req.method === "GET" ? id ? "read" : "query" :
      req.method === "POST" && !id ? "create" :
      req.method === "PUT" && id ? "update" :
      req.method === "DELETE" ? "delete" : null;

    if (type == null) return next();

    const {query,user} = req;

    switch (type) {
      case "query":
        res.send(await this.query({ ...query, user }));
        break;
      default:
        return next();
    }
  }

  actions = {};

  registerAction(name, fn) {
    if (name && typeof name === "object") {
      Object.keys(name).forEach(n => this.registerAction(n, name[n]));
      return this;
    }

    check(name, ["string","truthy"], "Expecting non-empty string for action name.");
    
    if (typeof fn === "function") fn = { handle: fn };
    check(fn, ["object","truthy"], "Expecting an object for action.");

    this.actions[name] = fn;
  }

  getAction(name) {
    return {
      ...Model.actions[name],
      ...this.actions[name],
      name
    };
  }

  handleAction(action, data, ...args) {
    if (typeof action === "string") action = this.getAction(action);
    const hasData = typeof data !== "undefined";
    
    if ((action.validate && !action.validate.apply(this, args)) ||
      (this._validate && !this._validate(action.name, ...args))) {
      throw new Error(`Invalid ${action.name} action`);
    }

    if (hasData) {
      if (this.schema && !this.schema(data)) {
        throw this.schema.errors[0];
      }

      if (action.normalize) data = action.normalize.call(this, data, ...args); 
      if (this._normalize) data = this._normalize.call(this, data, ...args); 
    }

    if (action.handle) {
      return action.handle.apply(this, (hasData ? [data] : []).concat(action, args));
    }
  }

  transform(action, doc, opts) {
    if (typeof action === "string") action = this.getAction(action);
    if (action.transform) doc = action.transform.call(this, doc, opts);
    if (this._transform) doc = this._transform.call(this, doc, opts);
    return doc;
  }

  async query(opts) {
    const action = this.getAction("query");
    const rows = await this.handleAction(action, void 0, opts);

    let out;
    if (Array.isArray(rows)) out = { rows };
    else if (rows != null && Array.isArray(rows.rows)) out = rows;
    else out = { rows: [] };

    if (out.total_rows == null) {
      out.total_rows = out.rows.length;
    }

    out.rows = out.rows.map((d) => this.transform(action, d, opts));

    return out;
  }
}