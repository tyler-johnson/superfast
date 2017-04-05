import API from "./api";
import Model from "./model";

export {API,Model};

export default function(conf) {
  return new API(conf);
}