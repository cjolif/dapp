define(["require", "dcl/dcl", "dojo/on", "dojo/_base/lang", "dojo/Deferred", "../../Controller"],
	function (require, dcl, on, lang, Deferred, Controller, DisplayController) {

	var resolveView = function (event, newView) {
		// in addition to arguments required by delite we pass our own needed arguments
		// to get them back in the transitionDeferred
		event.loadDeferred.resolve({ child: newView.domNode, dapp: {
				nextView: newView,
				previousView: event.parent._activeView
			}
		});
	};

	return dcl(Controller, {
		constructor: function () {
			document.addEventListener("delite-display-load", lang.hitch(this, "_loadHandler"));
		},
		_loadHandler: function (event) {
			event.preventDefault();
			// load the actual view
			// TODO: don't I have two cases here, when the parent is a delite display container and when not?
			// probably to be solved by having all delite containers support the eventing mechanism
			var viewId = event.dest || "";
			// TODO: deal with defaultParams?
			var params = event.params || "";
			var view = event.parent.children[viewId];
			// once loaded we will be ready to call beforeActivate
			event.loadDeferred.then(function (value) {
				if (value.dapp.previousView) {
					value.dapp.previousView.beforeDeactivate(value.dapp.nextView);
				}
				if (value.dapp.nextView) {
					value.dapp.nextView.beforeActivate(value.dapp.previousView);
				}
				return value;
			});
			// once transition we will be ready to call afterActivate
			on.once(event.target, "delite-display-complete", function (complete) {
				// TODO works for StackView but what about containers with several views visible same time
				complete.parent._activeView = complete.dapp.nextView;
				if (complete.dapp.nextView) {
					complete.dapp.nextView.afterActivate(complete.dapp.previousView);
				}
				if (complete.dapp.previousView) {
					complete.dapp.previousView.afterDeactivate(complete.dapp.nextView);
				}
			});
			if (view) {
				// set params to new value before returning
				if (params) {
					view.params = params;
				}
				resolveView(event, view);
			} else {
				this._createView(event, viewId, params, event.parent, event.parent.views[viewId].type);
			}
		},

		_createView: function (event, name, params, parent, type) {
			var app = this.app;
			// TODO: in my prototype View names & ids are the same, so view names must be unique
			require([type ? type : "../../View"], function (View) {
				var params = {
					"app": app,
					"id": name,
					"parent": parent
				};
				dcl.mix(params, { "params": params });
				new View(params).start().then(function (newView) {
					parent.children[name] = newView;
					resolveView(event, newView);
				});
			});
		}
	});
});
