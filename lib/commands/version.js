export default function version() {
	var pkg = require("./package.json");
	console.log("%s v%s", pkg.name, pkg.version);
}
