import contains from "lodash/collection/contains";

function printRequire(n) {
	return `require(${JSON.stringify(n)});\n`;
}

function printComment(c) {
	return c.split(/\r?\n/g).map((l) => `// ${l}\n`).join("");
}

export default function entry(files) {
	let str = printComment("Packages") +
		Object.keys(this.metadata.dependencies).map(printRequire).join("") +
		"\n" + printComment("Internal Files");

	files.filter((f) => {
		return contains(f.targets, "server") && f.type === "script";
	}).forEach(function(f) {
		str += printRequire("./" + f.path);
	});

	return {
		path: "server.js",
		source: str
	};
}
