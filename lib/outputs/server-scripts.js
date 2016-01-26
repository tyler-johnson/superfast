import path from "path";
import slug from "../utils/slug";
import hash from "../utils/hash";

function printRequire(n) {
	return `require(${JSON.stringify(n)});\n`;
}

function isServerScript(f) {
	return f.isTarget("server") && f.type === "script";
}

function filename(file) {
	let base = path.join(path.dirname(file), slug(path.basename(file, path.extname(file))));
	base += "-" + hash(file).toString(16) + ".js";
	return base;
}

export default function serverScripts(files) {
	let str = "";

	this.requires.forEach(f => {
		if (isServerScript(f)) str += printRequire(f.path);
	});

	let p = files.filter(isServerScript).map(f => {
		let p = path.join("server_build", filename(f.path));
		str += printRequire("./" + p);
		return f.getSource().then(s => {
			return { path: p, source: s };
		});
	});

	return Promise.all(p).then(res => {
		res.push({
			path: "server.js",
			source: str
		});

		return res;
	});
}
