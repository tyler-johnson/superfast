import types, {compile} from "kontur";
import Ajv from "ajv";

export {types}

export default function(opts={}) {
  return function(api) {
    api.onModel(function onModel(model) {
      if (!model.conf.schema) return;

      const ajv = new Ajv({
        useDefaults: true,
        removeAdditional: "all"
      });

      this.schema = ajv.compile(compile(model.conf.schema));
      const validate = (doc) => {
        if (this.schema(doc)) throw this.schema.errors[0];
      };

      if (!opts.observe || typeof opts.observe === "string") {
        this.observe(opts.observe || "normalize", (e, doc) => validate(doc));
      } else if (typeof opts.observe === "function") {
        opts.observe.call(this, model, validate);
      } else {
        throw new Error("Expecting string or function for observe.");
      }
    });
  };
}