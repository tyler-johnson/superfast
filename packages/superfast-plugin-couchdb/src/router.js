import {Router} from "express";
import couchdbAuthProxy from "couchdb-auth-proxy";
import cors from "cors";

export default function(router) {
  const manager = this.backend("couchdb");
  if (!manager) return;

  // create auth proxies for database that are missing proxy info
  const authProxies = manager.databases.reduce((proxies, db) => {
    if (!db.privateOnly && !db._proxyUrl) {
      proxies[db.id] = authProxy({
        target: db._url
      });
    }

    return proxies;
  }, {});
    
  // database auth proxies
  router.use("/:dbid", function(req, res, next) {
    if (authProxies[req.params.dbid]) {
      authProxies[req.params.dbid](req, res, next);
    } else {
      next();
    }
  });
}

function authProxy(api, conf={}) {
  const {info,target,secret} = conf;
  const app = new Router();

  app.use(cors({
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "DELETE"],
    allowedHeaders: ["accept", "authorization", "content-type", "origin", "referer", "x-csrf-token"],
    credentials: false,
    maxAge: 10 * 60
  }));

  app.use(couchdbAuthProxy(async function(req) {
    const auth = (req.get("Authorization") || '').trim();
    delete req.headers["Authorization"];
    delete req.headers["authorization"];
    delete req.headers["Cookie"];
    delete req.headers["cookie"];

    let userCtx;
    if (typeof req.user !== "undefined") userCtx = req.user;
    else userCtx = await api.authenticate(auth);

    return userCtx;
  }, {
    target, secret, info,
  }));

  return app;
}