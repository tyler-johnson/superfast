// for methods that we don't know if they are callback or promise async
export default function confusedAsync(fn, ctx, args) {
	if (fn.length > args.length) {
		return new Promise(function(resolve, reject) {
			fn.apply(ctx, args.concat(function(err, r) {
				if (err) reject(err);
				else resolve(r);
			}));
		});
	} else {
		return Promise.resolve(fn.apply(ctx, args));
	}
}
