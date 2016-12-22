import {check} from "./utils/check.js";
import CouchDB from "./couchdb";
import {splitPathname} from "./utils/url";
import {compile} from "kontur";
import Ajv from "ajv";
import {ValidationError,MissingError,ExistsError} from "./error";
import EventEmitter from "./eventemitter";

// Model Action Lifecycle Event Runner
class MALER {
  static defaultActions = {
    async query(e, opts={}) {
      const {view,include_docs,descending,key,keys} = e.query || {};
      const {limit,skip} = opts;
      const getdoc = !view || include_docs;

      const qopts = {
        descending, limit, skip,
        include_docs: getdoc,
        key: typeof key === "function" ? key(opts) : void 0,
        keys: typeof keys === "function" ? keys(opts) : void 0
      };

      let {total_rows,rows} = await (view ? e.model.db.query(view, qopts) : e.model.db.allDocs(qopts));
      rows = rows.map(r => getdoc ? r.doc : r.value);
      if (getdoc) rows = rows.filter(r => r._id && r._id.substr(0,8) !== "_design/");

      return { total_rows, rows };
    },
    async get(e, id, opts={}) {
      const {view,include_docs,descending,key,keys} = e.query || {};
      const getdoc = !view || include_docs;

      const qopts = {
        descending,
        include_docs: getdoc,
        limit: 1,
        key: typeof key === "function" ? key(id, opts) : id,
        keys: typeof keys === "function" ? keys(id, opts) : void 0
      };

      const {rows} = await (view ? e.model.db.query(view, qopts) : e.model.db.allDocs(qopts));

      return rows.length ? rows[0][getdoc ? "doc" : "value"] : null;
    },
    async create(e, doc, opts={}) {
      if (!doc._id) {
        const {id,rev} = await e.model.db.post(doc, opts);
        return { ...doc, _id: id, _rev: rev };
      }

      const {rev} = await e.model.db.upsert(doc._id, (ex) => {
        if (ex && ex._rev) {
          throw new ExistsError(`${e.model.name} already exists with provided id.`);
        }

        return { ...doc };
      });

      return { ...doc, _rev: rev };
    },
    async update(e, doc, id) {
      const {rev} = await e.model.db.upsert(id, (ex) => {
        if (!ex || !ex._rev) {
          throw new MissingError(`No ${e.model.name} exists with provided id.`);
        }

        return { ...doc };
      });

      return { ...doc, _id: id, _rev: rev };
    },
    async delete(e, id) {
      const {rev} = await e.model.db.upsert(id, (ex) => {
        if (!ex || !ex._rev) {
          throw new MissingError(`No ${e.model.name} exists with provided id.`);
        }

        return { _deleted: true };
      });

      return { _id: id, _rev: rev, _deleted: true };
    }
  };

  constructor(action, evtData) {
    this.action = action;
    this.evtData = evtData;
  }

  async validate(...args) {
    const event = this.action.createEvent("validate", this.evtData);
    const valid = await this.action.reduceEvent(event, async function(m, fn) {
      if (!(await fn.call(this, event, ...args))) {
        event.stopImmediatePropagation();
        return false;
      }

      return true;
    }, true);

    if (!valid) {
      throw new ValidationError();
    }
  }

  async normalize(data, ...args) {
    const event = this.action.createEvent("normalize", this.evtData);
    const res = await this.action.reduceEvent(event, async function(m, fn) {
      return fn.call(this, event, m, ...args);
    }, data);

    if (event.model.schema && !event.model.schema(res)) {
      const err = event.model.schema.errors[0];
      throw new ValidationError(err.message);
    }

    return res;
  }

  async handle(...args) {
    const event = this.action.createEvent("handle", {
      defaultListener: MALER.defaultActions[this.evtData.action],
      ...this.evtData
    });

    return await this.action.reduceEvent(event, async function(m, fn) {
      return fn.call(this, event, ...args);
    });
  }

  async transform(data, ...args) {
    const event = this.action.createEvent("transform", this.evtData);
    return await this.action.reduceEvent(event, async function(m, fn) {
      return fn.call(this, event, m, ...args);
    }, data);
  }
}

export default class Model extends EventEmitter {
  static actionEvents = ["validate","normalize","transform","response"];

  constructor(conf={}) {
    super();
    this.conf = conf;
    this.name = check(conf.name, ["string","truthy"], "Expecting non-empty string for model name.");
    this.setup = check(conf.setup, { $or: ["function","empty"] }, "Expecting function for setup.");
    
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

    Model.actionEvents.forEach(evt => {
      if (conf[evt]) this.addEventListener(evt, conf[evt]);
    });
  }

  init(api) {
    check(this.db, "empty", "This model has already be initiated.");

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

    this.api = this._eventParent = api;
    this.couch = couch;

    const dbname = this.conf.dbname || this.name;
    this.db = couch.createPouchDB(dbname);

    couch.setup(async () => {
      try {
        await couch.request("PUT", dbname);
      } catch(e) {
        if (e.status !== 412) throw e;
      }

      await this.setup(this.db);
    });
  }

  async handleRequest(req, res, next) {
    const segments = splitPathname(req.path);
    if (segments[0] !== this.name || segments.length > 2) return next();

    const id = segments[1];
    const type = req.method === "GET" ? id ? "get" : "query" :
      req.method === "POST" && !id ? "create" :
      req.method === "PUT" && id ? "update" :
      req.method === "DELETE" && id ? "delete" : null;

    if (type == null) return next();

    const {query,user} = req;
    let output;

    switch (type) {
      case "query":
        output = await this.query(query, user);
        break;
      case "get": {
        const doc = await this.get(id, query, user);
        if (doc == null) throw new MissingError(`No ${this.name} exists with provided id.`);
        output = doc;
        break;
      }
      case "create":
        output = await this.create(req.body, query, user);
        break;
      case "update":
        output = await this.update(req.body, id, query, user);
        break;
      case "delete":
        output = await this.delete(id, query, user);
        break;
      default:
        return next();
    }

    const event = this.createEvent("response", { user, model: this });
    res.json(await this.reduceEvent(event, function(m, fn) {
      return fn.call(this, event, m, query);
    }, output));
  }

  actions = {};

  registerAction(name, events) {
    if (name && typeof name === "object") {
      Object.keys(name).forEach(n => this.registerAction(n, name[n]));
      return this;
    }

    check(name, ["string","truthy"], "Expecting non-empty string for action name.");
    
    if (typeof events === "function") events = { handle: events };
    check(events, ["object","truthy"], "Expecting an object or function for action.");

    const action = new EventEmitter(this);
    action.name = name;

    Object.keys(events).forEach(key => {
      if (typeof events[key] === "function") {
        action.addEventListener(key, events[key]);
      }
    });

    this.actions[name] = action;

    return this;
  }

  getActionHandler(name, mixin) {
    const action = this.actions[name] || this;
    const evtData = {
      action: name,
      model: this,
      ...mixin
    };

    return new MALER(action, evtData);
  }

  async query(opts, user) {
    const handler = this.getActionHandler("query", {
      user,
      query: this.conf.query
    });
    
    await handler.validate(null, opts);

    let res = await handler.handle(opts);
    if (Array.isArray(res)) res = { rows: res };
    else if (res == null || !Array.isArray(res.rows)) res = { rows: [] };

    const rowscopy = new Array(res.rows.length);
    for (let i = 0; i < res.rows.length; i++) {
      rowscopy[i] = await handler.transform(res.rows[i], null, opts);
    }

    return {
      total_rows: res.total_rows != null ? res.total_rows : res.rows.length,
      rows: rowscopy
    };
  }

  async get(id, opts, user) {
    const handler = this.getActionHandler("get", {
      user,
      query: this.conf.query
    });

    await handler.validate(id, opts);
    let res = await handler.handle(id, opts);
    return await handler.transform(res, id, opts);
  }

  async create(doc, opts, user) {
    const handler = this.getActionHandler("create", { user });
    await handler.validate(null, opts);
    doc = await handler.normalize(doc, null, opts);
    let res = await handler.handle(doc, opts);
    return await handler.transform(res, null, opts);
  }

  async update(doc, id, opts, user) {
    const handler = this.getActionHandler("update", { user });
    await handler.validate(id, opts);
    doc = await handler.normalize(doc, id, opts);
    let res = await handler.handle(doc, id, opts);
    return await handler.transform(res, id, opts);
  }

  async delete(id, opts, user) {
    const handler = this.getActionHandler("delete", { user });
    await handler.validate(id, opts);
    let res = await handler.handle(id, opts);
    return await handler.transform(res, id, opts);
  }
}