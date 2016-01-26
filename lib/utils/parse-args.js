import {omit,isArray,mergeWith} from "lodash";
import minimist from "minimist";

export default function(argv, sf, opts) {
	let args = minimist(argv._, opts);
	return mergeWith({}, sf.Compiler.defaults, omit(argv, "_"), args, function(a, b) {
		if (isArray(a) && b != null) return a.concat(b);
	});
}
