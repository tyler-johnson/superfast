import assign from "lodash/object/assign";
// import pick from "lodash/object/pick";
var thispkg = require("./package.json");

export default function packageJson(files, options) {
	if (!options.production) return;

	let pkg = {};
	if (options.package) assign(pkg, options.package);

	pkg.dependencies = assign(pkg.dependencies || {}, this.metadata.dependencies);
	pkg.devDependencies = assign(pkg.devDependencies || {}, this.metadata.devDependencies);

	pkg.superfast = {
		id: this.metadata.id,
		version: thispkg.version
	};

	pkg.main = "server.js";
	pkg.scripts = assign({
		start: "NODE_ENV=production node server.js"
	}, pkg.scripts);

	return {
		path: "package.json",
		source: JSON.stringify(pkg, null, 2)
	};
}
