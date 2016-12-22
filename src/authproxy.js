import {Router} from "express";
import couchdbAuthProxy from "couchdb-auth-proxy";
import superagent from "superagent";
import cors from "cors";

export default function(conf={}) {
  const app = new Router();

  const {sessionUrl,info,target,secret,authenticate} = conf;

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

    if (!auth) return;

    try {
      if (authenticate) {
        return await authenticate(auth);
      } else if (sessionUrl) {
        const {body} = await superagent
          .get(sessionUrl)
          .set("Authorization", auth);

        return body;
      } else {
        throw new Error("Missing authentication method.");
      }
    } catch(e) {
      console.error(e.stack || e);
      return;
    }
  }, {
    target, secret, info,
  }));

  return app;
}
