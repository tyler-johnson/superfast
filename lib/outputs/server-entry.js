import fs from "fs-promise";
import contains from "lodash/collection/contains";

function printRequire(n) {
	return `require(${JSON.stringify(n)});\n`;
}

function printComment(c) {
	return c.split(/\r?\n/g).map((l) => `// ${l}\n`).join("");
}

export default function entry(files, options) {
	let str = printComment("Packages") +
		Object.keys(this.metadata.dependencies).map(printRequire).join("") +
		"\n" + printComment("Internal Files");

	files = files.filter((f) => {
		return contains(f.targets, "server") && f.type === "script";
	});

	files.forEach(function(f) {
		str += printRequire("./" + f.path);
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
