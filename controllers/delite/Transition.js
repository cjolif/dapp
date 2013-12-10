define(["dcl/dcl", "dojo/on", "dojo/when", "dojo/Deferred", "dojo/promise/all", "dojo/_base/lang", "../../Controller"],
	function (dcl, on, when, Deferred, all, lang, Controller) {

	return dcl(Controller, {
		constructor: function () {
			document.addEventListener("delite-display", lang.hitch(this, "_displayHandler"), true);
		},
		_displayHandler: function (event) {
			if (event.target === document) {
				this._displayViews(event);
			}
		},
		_displayViews: function (event, skipParents) {
			var views = event.dest && event.dest.split("+");
			if (views) {
				for (var i = 0; i < views.length; i++) {
					// display the view
					this._displayView(views[i], event, true, skipParents);
				}
			} else {
				// this is the root
				this._displayView(null, event, true, skipParents);
			}
		},
		_displayView: function (viewTarget, event, displayDefaultView, skipParents) {
			var deferred = new Deferred(), self = this, subEvent, parent;
			// wait for parents to be displayed first
			when(skipParents || this._displayParents(viewTarget, event), function (value) {
				subEvent = Object.create(event);
				subEvent.dest = viewTarget.split(",").pop();
				subEvent.transitionDeferred = deferred;
				// parent is the view, the container is only child of the view
				// TODO make sure one can in the config of the view specify a different container
				// "myview": { container: "a query string" }
				// and when specified use the query string here to get the container instead of the only child
				subEvent.parent = parent = value.dapp.nextView;
				parent.containerNode.emit("delite-display", subEvent);
				// if we are at the init view, check if we have defaultView children to display in addition
				if (displayDefaultView) {
					on.once(parent.containerNode, "delite-display-load", function (loadEvent) {
						loadEvent.loadDeferred.then(function (value) {
							if (value.dapp.nextView.defaultView) {
								// TODO: here we re-use the same transition as was initially setup
								// do we want to use it for defaultView as well?
								var newEvent = Object.create(loadEvent);
								newEvent.dest = value.dapp.nextView.defaultView;
								self._displayViews(newEvent, value);
							}
						});
					});
				}
			});
			return deferred.promise;
		},
		_displayParents: function (viewTarget, event) {
			// for now we consider the parents are listed in the display command (i.e. parent1,parent2,view)
			// TODO: we might improve that later to avoid users have to specify this?
			var parts = viewTarget && viewTarget.split(",");
			if (parts && parts.length > 1) {
				parts.pop();
				return this._displayView(parts.join(","), event);
			}
			return { dapp : { nextView: this.app } };
		}
	});
});
