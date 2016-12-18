import {check} from "./utils/check.js";
import CouchDB from "./couchdb";
import {splitPathname} from "./utils/url";
import {compile} from "kontur";
import Ajv from "ajv";

export default class Model {
  static configMethods = ["setup","validate","normalize","transform"];

  static actions = {
    async query(conf={}, opts={}) {
      const {view,include_docs,descending,key,keys} = conf;
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
    },
    async get(conf, id, opts={}) {
      return await this.db.get(id, opts);
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

    Model.configMethods.forEach(m => {
      if (typeof conf[m] === "function") this["_" + m] = conf[m];
    });
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
    const type = req.method === "GET" ? id ? "get" : "query" :
      req.method === "POST" && !id ? "create" :
      req.method === "PUT" && id ? "update" :
      req.method === "DELETE" ? "delete" : null;

    if (type == null) return next();

    const {query,user} = req;

    switch (type) {
      case "query":
        res.send(await this.query({ ...query, user }));
        break;
      case "get":
        res.send(await this.get(id, { ...query, user }));
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
    let def = Model.actions[name];
    if (typeof def === "function") def = { handle: def };

    return {
      ...def,
      ...this.actions[name],
      name
    };
  }

  async handleAction(action, ctx, ...args) {
    if (typeof action === "string") action = this.getAction(action);
    let {write=false,data={},transform=true} = (ctx || {});
    let res;
    
    if ((action.validate && !(await action.validate.apply(this, args))) ||
      (this._validate && !(await this._validate(action.name, ...args)))) {
      throw new Error(`Invalid ${action.name} action`);
    }

    if (write) {
      if (this.schema && !this.schema(data)) {
        throw this.schema.errors[0];
      }

      if (action.normalize) data = await action.normalize.call(this, data, ...args); 
      if (this._normalize) data = await this._normalize.call(this, data, ...args); 
    }

    if (action.handle) {
      res = await action.handle.apply(this, (write ? [data] : []).concat(args));
    }

    if (transform) {
      res = await this.transformAction(action, res, ...args);
    }

    return res;
  }

  async transformAction(action, doc, ...args) {
    if (typeof action === "string") action = this.getAction(action);
    if (action.transform) doc = await action.transform.call(this, doc, ...args);
    if (this._transform) doc = await this._transform.call(this, doc, ...args);
    return doc;
  }

  async query(opts) {
    const action = this.getAction("query");
    const conf = this.conf.query;

    let res = await this.handleAction(action, { transform: false }, conf, opts);
    if (Array.isArray(res)) res = { rows: res };
    else if (res == null || !Array.isArray(res.rows)) res = { rows: [] };

    const rowscopy = new Array(res.rows.length);
    for (let i = 0; i < res.rows.length; i++) {
      rowscopy[i] = await this.transformAction(action, res.rows[i], conf, opts);
    }

    return {
      total_rows: res.total_rows != null ?
        res.total_rows :
        res.rows.length,
      rows: rowscopy
    };
  }

  async get(id, opts) {
    return await this.handleAction("get", null, this.conf.query, id, opts);
  }
}