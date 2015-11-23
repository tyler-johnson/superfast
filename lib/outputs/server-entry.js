import fs from "fs-promise";
import contains from "lodash/collection/contains";

function printRequire(n) {
	return `require(${JSON.stringify(n)});\n`;
}

export default function entry(files, options) {
	let str = "";

	files = files.filter((f) => {
		return contains(f.targets, "server") && f.type === "script";
	});

	files.forEach(function(f) {
		str += printRequire((f.fullPath ? "./" : "") + f.path);
	});

	let p = !options.production ? [] : files.map(f => {
		return fs.readFile(f.fullPath, { encoding: "utf-8" }).then(s => {
			return {
				path: f.path,
				source: s
			};
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
