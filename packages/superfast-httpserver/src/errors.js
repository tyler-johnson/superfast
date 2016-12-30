import {InternalServerError,isError} from "superfast-error";

export default function(err, req, res, next) {
    if (!err) return next();

    if (!isError(err)) {
      console.error(err);
      err = new InternalServerError();
    }

    res.status(err.status).json(err);
}
