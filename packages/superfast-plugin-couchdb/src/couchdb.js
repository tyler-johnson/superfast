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
// time that a cached database size is good for, 5 minutes
const DEFAULT_TIMEOUT = 5 * 60 * 1000;

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
    const {proxy,alts,id} = this._options = { ...config, ...query };

    this.id = id || uniqueId("db");

    this._alts = [].concat(alts)
      .filter(a => typeof a === "string")
      .filter(Boolean)
      .map(a => parse(a, false, true));

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
    let headers;

    if (opts.userCtx) {
      const {name,roles} = opts.userCtx || {};
      const {secret} = this._options;
      headers = proxyAuth(name, roles, secret);
    }

    return new PouchDB(this.privateUrl(dbname), {
      skipSetup: true,
      auth: this._auth,
      ...opts,
      headers: { ...opts.headers, ...headers },
      adapter: "http"
    });
  }

  extractDBName(dburl) {
    if (typeof dburl === "string") dburl = parse(dburl, false, true);

    const urls = [].concat(this._alts);
    const publicUrl = this.publicUrl();
    if (publicUrl) urls.unshift(parse(publicUrl, false, true));

    while (urls.length) {
      const url = urls.shift();
      if (!urlContains(dburl, url)) continue;

      return (dburl.pathname || "")
        .substr((url.pathname || "").length)
        .split("/")
        .filter(Boolean)[0];
    }
  }

  privateUrl(dbname) {
    if (dbname == null) return this._url;

    const couchurl = parse(this._url, false, true);
    const dburl = parse(dbname, false, true);

    // test against private url
    if (dburl.host && dburl.host === couchurl.host) {
      return dbname;
    }

    const _dbname = this.extractDBName(dburl);
    const url = joinUrl(couchurl, _dbname || dbname || "");

    this.debug("resolved private db url : %s -> %s", dbname, url);
    return url;
  }

  publicUrl(dbname) {
    if (this.privateOnly) return null;

    let proxyUrl;
    if (this._proxyUrl) proxyUrl = this._proxyUrl;
    else proxyUrl = "/" + this.id;

    if (dbname != null) {
      const _dbname = this.extractDBName(dbname);
      proxyUrl = joinUrl(proxyUrl, _dbname || dbname);
      this.debug("resolved public db url : %s -> %s", dbname, proxyUrl);
    }

    return proxyUrl;
  }

  testUrl(url) {
    if (typeof url === "string") url = parse(url, false, true);
    const pub = parse(this.publicUrl(), false, true);
    return urlContains(url, pub) || this._alts.some(a => {
      return urlContains(url, a);
    });
  }

  async size() {
    const size = this._size;
    const last_fetch = this._size_fetch;

    if (size != null && last_fetch && ((Date.now() - last_fetch) < DEFAULT_TIMEOUT)) {
      return size;
    }

    return this.updateSize();
  }

  async updateSize() {
    const dbs = await this.request("GET", "/_all_dbs");
    this._size = dbs.length;
    this._size_fetch = Date.now();
    return this._size;
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
