export default function version() {
	var pkg = require("./package.json");
	console.log("%s %s", pkg.name, pkg.version == null ? "dev-build" : "v" + pkg.version);
}
