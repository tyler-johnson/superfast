import {assign} from "lodash";
var ignore = require("ignore");

let ignore_keys = ["_patterns", "_rules", "_ignoreFiles"];

ignore.merge = function(...eyes) {
	let ign = ignore();
	eyes = eyes.filter(i => i instanceof ignore.Ignore);

	for (var i of eyes) {
		for (var k of ignore_keys) {
			ign[k] = ign[k].concat(i[k]);
		}

		assign(ign.options, i.options);
	}

	return ign;
};

ignore.Ignore.prototype.clone = function() {
	return ignore.merge(this);
};

ignore.Ignore.prototype.merge = function(...i) {
	return ignore.merge.apply(null, [this].concat(i));
};

export default ignore;
