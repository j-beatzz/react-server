
var EventEmitter = require('events').EventEmitter,
	Router = require('routr'),
	Q = require('q');

class Navigator extends EventEmitter {

	constructor (context, routes, applicationStore) {
		this.router = new Router(routes);
		this.context = context;
		
		this._loading = false;
		this._currentRoute = null;
	}

	navigate (request, type) {

		var route = this.router.getRoute(request.getUrl(), {navigate: {path:request.getUrl()}});
		if (!route) {
			setTimeout( () => {
				this.emit('navigateDone', { status: 404, message: "No Route!" });
			}, 0);
			return;
		}

		this.startRoute(route);
		this.emit('navigateStart', route);

		/* Breathe... */

		route.config.page().done( pageConstructor => {
			if (request.setRoute) {
				request.setRoute(route);
			}
			this.handlePage(pageConstructor, request, this.context.loader);
		}, err => {
			console.error("Error resolving page", err);
		});

	}

	handlePage(pageConstructor, request, loader) {
		// instantiate the page we need to fulfill this request.
		var page = new pageConstructor();

		// call page.handleRoute(), and use the resulting code to decide how to 
		// respond. -sra.
		// note that handleRoute can return a handleRouteResult or a Promise of handleRouteResult. using
		// Q() to normalize that and make it always be a Promise of handleRouteResult. -sra.
		var handleRouteValueOrPromise = page.handleRoute ? page.handleRoute(request, loader) : {code: 200};
		Q(handleRouteValueOrPromise).then(handleRouteResult => {
			// TODO: I think that 3xx/4xx/5xx shouldn't be considered "errors" in navigateDone, but that's
			// how the code is structured right now, and I'm changing too many things at once at the moment. -sra.
			if (handleRouteResult.code && handleRouteResult.code / 100 !== 2) {
				this.emit("navigateDone", {status: handleRouteResult.code, redirectUrl: handleRouteResult.location});
			}
			if (handleRouteResult.page) {
				// in this case, we should forward to a new page *without* changing the URL. Since we are already
				// in an async callback, we should schedule a new handlePage with the new page constructor and return
				// from this call.
				setTimeout(() => this.handlePage(handleRouteResult.page, request, loader), 0);
				return;
			}

			this.finishRoute();
			this.emit('navigateDone', null, page);
		}).catch(err => {
			console.error("Error while handling route.", err);
		});

	}

	getState () {
		return {
			loading: this._loading,
			route: this._currentRoute
		}
	}

	getCurrentRoute () {
		return this._currentRoute;
	}

	getLoading () {
		return this._loading;
	}

	startRoute (route) {
		this._loading = true;
		this._currentRoute = route;
	}

	finishRoute () {
		this._loading = false;
	}

}

module.exports = Navigator;