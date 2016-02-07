import {includes,last} from "lodash";

export default function sortFiles(files) {
	return files.map((f) => {
		return f.split("/");
	}).sort((a, b) => {
		// main files are always last
		let amain = last(a).substr(0, 5) === "main.";
		let bmain = last(b).substr(0, 5) === "main.";
		if (amain && !bmain) return 1;
		else if (!amain && bmain) return -1;

		// lib folders are always first
		let alib = includes(a, "lib");
		let blib = includes(b, "lib");
		if (alib && !blib) return -1;
		else if (!alib && blib) return 1;

		// deeper paths before short paths
		if (a.length > b.length) return -1;
		else if (b.length > a.length) return 1;

		// normal alphabetical
		return a.join("/").localeCompare(b.join("/"));
	}).map((f) => {
		return f.join("/");
	});
}
