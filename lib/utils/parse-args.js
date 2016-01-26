import {omit,isArray,mergeWith} from "lodash";
import minimist from "minimist";

export default function(argv, opts) {
	let args = minimist(argv._, opts);
	return mergeWith({}, args, omit(argv, "_"), function(a, b) {
		if (isArray(a) && b != null) return a.concat(b);
	});
}
