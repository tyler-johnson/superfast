import {UnauthorizedError} from "superfast-error";

export default async function(auth) {
  if (typeof auth !== "string" ||
    auth.substr(0, 6).toLowerCase() !== "basic ") return;

  try {
    const {body} = await this.users.couch
      .request("GET", "/_session")
      .set("Authorization", auth);

    return body.userCtx;
  } catch(e) {
    throw new UnauthorizedError("Invalid username or password");
  }
}