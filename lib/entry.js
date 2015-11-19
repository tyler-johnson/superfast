function printRequire(n) {
	return `require(${JSON.stringify(n)});\n`;
}

function printComment(c) {
	return c.split(/\r?\n/g).map((l) => `// ${l}\n`).join("");
}

export default function entry($) {
	let str = printComment("Packages");

	if (Array.isArray($.packages)) {
		str += $.packages.map(printRequire).join("");
	}

	str += "\n" + printComment("Internal Files");

	if (Array.isArray($.files)) {
		$.files.forEach(function(f) {
			if (f.type === "script") {
				str += printRequire("./build/" + f.out);
			}
		});
	}

	return str;
}
