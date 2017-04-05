import _debug from "debug";
import {uniqueId} from "lodash";
import {parse,format} from "url";
import superagent from "superagent";
import PouchDB from "pouchdb";
import designPlugin from "pouchdb-design";
import upsertPlugin from "pouchdb-upsert";
import securityPlugin from "pouchdb-security-helper";
import {join as joinUrl,contains as urlContains} from "superfast-util-url";
import proxyAuth from "couch-proxy-auth";
import {check} from "superfast-util-check";

PouchDB.plugin(designPlugin);
PouchDB.plugin(upsertPlugin);
PouchDB.plugin(securityPlugin);

const debug = _debug("pagedip-api:couchdb");
const proxy_handler = /{couch_httpd_auth,\s*proxy_authentication_handler}/i;

export default class CouchDB {
  constructor(config, opts={}) {
    this.debug = function(msg, ...params) {
      return debug("[ %s -> %s ] " + msg, ...[this._proxyUrl||this.id,this._url].concat(params));
    };

    this._setups = [];
    this.privateOnly = Boolean(opts.privateOnly);
    this.version = opts.version;
    this._parseConfig(config);
  }

  static isCouchDB(db) {
    return db instanceof CouchDB;
  }

  load() {
    if (this._loaded) return Promise.resolve();
    if (this._loading) return this._loading;
    return this._loading = this._load().then(() => {
      this._loaded = true;
      delete this._loading;
    }, (e) => {
      delete this._loading;
      throw e;
    });
  }

  setup(fn) {
    check(fn, "function", "Expecting function for setup.");
    this._setups.push(fn);
    return this;
  }

  async _setup() {
    for (let i = 0; i < this._setups.length; i++) {
      await this._setups[i].call(this);
    }

    await this.configure({
      httpd: {
        authentication_handlers: function(val) {
          if (typeof val !== "string") val = "";
          val = val.trim();
          if (!val.match(proxy_handler)) {
            val += (val ? ", " : "") + "{couch_httpd_auth, proxy_authentication_handler}";
          }
          return val;
        }
      },
      couch_httpd_auth: {
        users_db_public: "false"
      }
    });
  }

  async _load() {
    await this._setup();
    await this.updateSize();
    this.debug("connected");
  }

  _parseConfig(config={}) {
    if (typeof config === "string") {
      config = parse(config, true, true);
    } else if (typeof config.url === "string") {
      config = { ...parse(config.url, true, true), ...config };
    }

    const {protocol="http:",host="127.0.0.1:5984",pathname,auth,query} = config;
    const {proxy,id} = this._options = { ...config, ...query };

    this.id = id || uniqueId("db");

    if (proxy) {
      const {_protocol, _host, _pathname} = parse(proxy);
      this._proxyUrl = format({
        protocol: _protocol,
        host: _host,
        pathname: _pathname
      });
    }

    this._url = format({ protocol, host, pathname });

    if (this._url.substr(-1) === "/") {
      this._url = this._url.substr(0, this._url.length - 1);
    }

    if (auth) {
      let a = auth;
      if (typeof auth === "string") {
        let [username,...pass] = auth.split(":");
        a = { username, password: pass.join(":") };
      }

      this._auth = a;
    }
  }

  request(method, url) {
    const req = superagent(method, url);
    if (this._url) req.url = joinUrl(this._url, req.url);
    if (this._auth) req.auth(this._auth.username, this._auth.password);
    req.accept("application/json");
    return req;
  }

  createPouchDB(dbname, opts={}) {
    const o = {
      skipSetup: true,
      ...opts,
      adapter: "http"
    };

    if (typeof opts.userCtx !== "undefined") {
      const {name,roles} = opts.userCtx || {};
      delete o.userCtx;
      
      if (name) {
        const {secret} = this._options;
        const headers = proxyAuth(name, roles, secret);
        o.headers = { ...o.headers, ...headers };
      }
    } else if (!o.auth && this._auth) {
      o.auth = this._auth;
    }

    return new PouchDB(this.getCouchDBUrl(dbname), o);
  }

  getCouchDBUrl(dbname) {
    return joinUrl(this._url, dbname);
  }

  getProxyUrl(dbname) {
    if (this.privateOnly) return null;

    let proxyUrl;
    if (this._proxyUrl) proxyUrl = this._proxyUrl;
    else proxyUrl = "/" + this.id;

    if (dbname != null) {
      proxyUrl = joinUrl(proxyUrl, dbname);
      this.debug("resolved public db url : %s -> %s", dbname, proxyUrl);
    }

    return proxyUrl;
  }

  async configure(config) {
    if (typeof config !== "object" || config == null) {
      throw new Error("Expecting object for configuration.");
    }

    const sections = Object.keys(config);

    while (sections.length) {
      const section = sections.shift();
      if (!config[section] || typeof config[section] !== "object") {
        continue;
      }

      const items = Object.keys(config[section]);

      while (items.length) {
        const item = items.shift();
        let value = config[section][item];

        if (typeof value === "function") {
          try {
            const {body} = await this.request("GET", `/_config/${section}/${item}`)
              .accept("json");

            value = value(body);
          } catch(e) {
            if (e.status !== 404) {
              handleRequestError(e);
            }

            value = value();
          }
        }

        try {
          await this.request("PUT", `/_config/${section}/${item}`)
            .type("json")
            .accept("json")
            .send(JSON.stringify(value != null ? value.toString() : null));
        } catch(e) {
          handleRequestError(e);
        }
      }
    }
  }
}

function handleRequestError(e) {
  let resp = e.response;
  if (!resp) throw e;
  if (resp.body) throw resp.body;
  throw new Error(resp.text);
}
