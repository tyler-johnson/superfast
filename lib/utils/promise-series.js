export function each(list, onEach, ctx) {
    // return a thenable method if no list
    if (typeof list === "function") {
        return function(l) {
            return each(l, list, onEach);
        };
    }

	let len = list.length;
    let index = -1;

    // validate list
    if (typeof len !== "number" || len < 0 || isNaN(len)) {
        return Promise.reject(new Error("Expecting an array-like value for list."));
    }

    function next() {
        // bump index before every loop
        index++;

        // check if there are more
        if (index >= len) return Promise.resolve(list);

        // run the onEach method
        return Promise.resolve().then(function() {
            return onEach.call(ctx, list[index], index, list);
        })

        // and recursively call the next item
        .then(next);
    }

    return next();
}

export function map(list, onEach, ctx) {
    // return a thenable method if no list
    if (typeof list === "function") {
        return function(l) {
            return map(l, list, onEach);
        };
    }

    var res = new Array(list.length);

    return each(list, function(v, index) {
        var ctx = this, args = arguments;

        return Promise.resolve(onEach.apply(ctx, args)).then(function(val) {
            res[index] = val;
        });
    }, ctx).then(function() {
        return res;
    });
}
