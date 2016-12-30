import bodyParser from "body-parser";
import {Router} from "express";

const jsonParser = bodyParser.json();
const urlencodedParser = bodyParser.urlencoded({ extended: true });
const parseMethods = ["POST","PUT","PATCH","DELETE"];

export default function() {
  const parser = new Router();
  parser.use(jsonParser);
  parser.use(urlencodedParser);

  return async function(req, res, next) {
    if (parseMethods.indexOf(req.method) >= 0) {
      await parser(req, res, next);
    } else {
      req.body = {};
      next();
    }
  };
}
