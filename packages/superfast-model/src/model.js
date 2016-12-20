import {check} from "./utils/check.js";
import CouchDB from "./couchdb";
import {splitPathname} from "./utils/url";
import {compile} from "kontur";
import Ajv from "ajv";

export default class Model {
  static configMethods = ["setup","validate","normalize","transform"];

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
      req.method === "DELETE" && id ? "delete" : null;

    if (type == null) return next();

    const {query,user} = req;
    const opts = { ...query, user };

    switch (type) {
      case "query":
        res.send(await this.query(opts));
        break;
      case "get":
        res.send(await this.get(id, opts));
        break;
      case "create":
        res.send(await this.create(req.body, opts));
        break;
      case "update":
        res.send(await this.update(req.body, id, opts));
        break;
      case "delete":
        res.send(await this.delete(id, opts));
        break;
      default:
        return next();
    }
  }

  static actions = {
    async query(opts={}) {
      const {view,include_docs,descending,key,keys} = this.conf.query || {};
      const {limit,skip} = opts;
      const getdoc = !view || include_docs;

      const qopts = {
        descending, limit, skip,
        include_docs: getdoc,
        key: typeof key === "function" ? key(opts) : void 0,
        keys: typeof keys === "function" ? keys(opts) : void 0
      };

      let {total_rows,rows} = await (view ? this.db.query(view, qopts) : this.db.allDocs(qopts));
      rows = rows.map(r => getdoc ? r.doc : r.value);
      if (getdoc) rows = rows.filter(r => r._id && r._id.substr(0,8) !== "_design/");

      return { total_rows, rows };
    },
    async get(id, opts={}) {
      const {view,include_docs,descending,key,keys} = this.conf.query || {};
      const getdoc = !view || include_docs;

      const qopts = {
        descending,
        include_docs: getdoc,
        limit: 1,
        key: typeof key === "function" ? key(id, opts) : id,
        keys: typeof keys === "function" ? keys(id, opts) : void 0
      };

      const {rows} = await (view ? this.db.query(view, qopts) : this.db.allDocs(qopts));

      return rows.length ? rows[0][getdoc ? "doc" : "value"] : null;
    },
    async create(doc, opts={}) {
      if (!doc._id) {
        const {id,rev} = await this.db.post(doc, opts);
        return { ...doc, _id: id, _rev: rev };
      }

      const {rev} = await this.db.upsert(doc._id, (ex) => {
        if (ex && ex._rev) {
          throw new Error("already exists");
        }

        return { ...doc };
      });

      return { ...doc, _rev: rev };
    },
    async update(doc, id) {
      const {rev} = await this.db.upsert(id, (ex) => {
        if (!ex || !ex._rev) {
          throw new Error("Not found");
        }

        return { ...doc };
      });

      return { ...doc, _id: id, _rev: rev };
    },
    async delete(id) {
      const {rev} = await this.db.upsert(id, (ex) => {
        if (!ex || !ex._rev) {
          throw new Error("Not found");
        }

        return { _deleted: true };
      });

      return { _id: id, _rev: rev, _deleted: true };
    }
  };

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
    return this;
  }

  getAction(name) {
    let def = Model.actions[name];
    if (typeof def === "function") def = { handle: def };

    return def || this.actions[name] ? {
      ...def,
      ...this.actions[name],
      name
    } : null;
  }

  async handleAction(action, ctx, ...args) {
    if (typeof action === "string") action = this.getAction(action);
    let {data,transform=true} = (ctx || {});
    const write = typeof data !== "undefined";
    let res;
    
    if ((action.validate && !(await action.validate.apply(this, args))) ||
      (this._validate && !(await this._validate(action.name, ...args)))) {
      throw new Error(`Invalid ${action.name} action`);
    }

    if (write) {
      if (action.normalize) data = await action.normalize.call(this, data, ...args); 
      if (this._normalize) data = await this._normalize.call(this, data, ...args); 

      if (this.schema && !this.schema(data)) {
        throw this.schema.errors[0];
      }
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

    let res = await this.handleAction(action, { transform: false }, opts);
    if (Array.isArray(res)) res = { rows: res };
    else if (res == null || !Array.isArray(res.rows)) res = { rows: [] };

    const rowscopy = new Array(res.rows.length);
    for (let i = 0; i < res.rows.length; i++) {
      rowscopy[i] = await this.transformAction(action, res.rows[i], opts);
    }

    return {
      total_rows: res.total_rows != null ? res.total_rows : res.rows.length,
      rows: rowscopy
    };
  }

  async get(id, opts) {
    return await this.handleAction("get", null, id, opts);
  }

  async create(doc, opts) {
    return await this.handleAction("create", { data: doc }, opts);
  }

  async update(doc, id, opts) {
    return await this.handleAction("update", { data: doc }, id, opts);
  }

  async delete(id, opts) {
    return await this.handleAction("delete", null, id, opts);
  }
}