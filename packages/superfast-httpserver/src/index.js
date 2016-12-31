import express from "express";
import authProxy from "./authproxy";
import bodyParser from "./body-parser";
import handleErrors from "./errors";
import {NoRouteError} from "superfast-error";
import handleModel from "./model";

export default function(api) {
  const router = express();

  // wait for the api to load before requests go through
  const load = api.load();
  router.use(function(req, res, next) {
    load.then(() => next(), next);
  });

  // create auth proxies for database that are missing proxy info
  const manager = api.couchdbs;
  const authProxies = manager.databases.reduce((proxies, db) => {
    if (!db.privateOnly && !db._proxyUrl) {
      proxies[db.id] = authProxy({
        target: db._url,
        authenticate: api.authenticate
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

  // authenticate requests
  router.use(function(req, res, next) {
    api.authenticate(req.get("authorization")).then(r => {
      req.user = r || {};
      next();
    }).catch(next);
  });

  // parse incoming request bodies
  router.use(bodyParser());

  // core model routes
  router.use(function(req, res, done) {
    const models = Object.keys(api.models);

    const next = async (err) => {
      if (err) return done(err);
      if (!models.length) return done();
      const model = api.models[models.shift()];

      try {
        await handleModel(model, req, res, next);
      } catch(e) {
        return done(e);
      }
    };

    next();
  });

  // handle errors
  router.use(() => { throw new NoRouteError(); });
  router.use(handleErrors);

  return router;
}
