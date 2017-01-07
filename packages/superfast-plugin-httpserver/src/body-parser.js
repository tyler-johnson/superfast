import bodyParser from "body-parser";
import {Router} from "express";

const jsonParser = bodyParser.json();
const urlencodedParser = bodyParser.urlencoded({ extended: true });
const parseMethods = ["POST","PUT","PATCH","DELETE"];

export default function() {
  const parser = new Router();
  parser.use(jsonParser);
  parser.use(urlencodedParser);

  return async function(req, res) {
    if (req.body != null) return req.body;
    if (parseMethods.indexOf(req.method) >= 0) {
      return new Promise((resolve, reject) => {
        parser(req, res, (err) => err ? reject(err) : resolve(req.body));
      });
    } else {
      return (req.body = {});
    }
  };
}
