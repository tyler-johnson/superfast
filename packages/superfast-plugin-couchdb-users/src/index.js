import createUsers from "./users";
import authenticate from "./auth";

export default function() {
  return function(api) {
    // add the model for the _users database
    api.users = api.model(createUsers());

    // add basic authentication with CouchDB
    api.observe("authenticate", authenticate);
  };
}
