define(["require", "dojo/_base/kernel", "dojo/_base/lang", "dojo/_base/declare", "dojo/_base/config",
	"dojo/_base/window", "dojo/Evented", "dojo/Deferred", "dojo/when", "dojo/has", "dojo/on", "dojo/domReady",
	"dojo/dom-construct", "dojo/dom-attr", "./utils/nls", "./modules/lifecycle",
	"./utils/hash", "./utils/constraints", "./utils/config"],
	function (require, kernel, lang, declare, config, win, Evented, Deferred, when, has, on, domReady,
			  domConstruct, domAttr, nls, lifecycle, hash, constraints, configUtils) {

		has.add("app-log-api", (config.app || {}).debugApp);

		var Application = declare(Evented, {
			constructor: function (params, node) {
				lang.mixin(this, params);
				this.loadedControllers = [];
				this.children = {};
				this.loadedStores = {};
				// Create a new domNode and append to body
				// Need to bind startTransition event on application domNode,
				// Because dojox/mobile/ViewController bind startTransition event on document.body
				// Make application's root domNode id unique, this id can be visited by window namespace on Chrome 18.
				this.setDomNode(domConstruct.create("div", {
					id: this.id + "_Root",
					style: "width:100%; height:100%; overflow-y:hidden; overflow-x:hidden;"
				}));
				node.appendChild(this.domNode);
			},

			transitionToView: function (/*DomNode*/target, /*Object*/transitionOptions, /*Event?*/triggerEvent) {
				// summary:
				//		A convenience function to fire the transition event to transition to the view.
				//
				// target:
				//		The DOM node that initiates the transition (for example a ListItem).
				// transitionOptions:
				//		Contains the transition options.
				// triggerEvent:
				//		The event that triggered the transition (for example a touch event on a ListItem).
				var opts = {bubbles: true, cancelable: true, detail: transitionOptions,
							triggerEvent: triggerEvent || null};
				on.emit(target, "startTransition", opts);
			},

			unloadView: function (/*Object*/view, /*function?*/callback) {
				// summary:
				//		A convenience function to fire the app-unload-view event to unload the view and
				// the children of the view.
				//
				// view:
				//		The view to be unloaded.
				// callback:
				//		The callback function to call after the view and all child views are unloaded.
				var evt = {"view": view, "callback": callback};
				on.emit(this, "app-unload-view", evt);
			},


			_createDataStore: function () {
				// summary:
				//		Create data store instance
				if (this.stores) {
					//create stores in the configuration.
					for (var item in this.stores) {
						if (item.charAt(0) !== "_") {//skip the private properties
							var type = this.stores[item].type ? this.stores[item].type : "dojo/store/Memory";
							var config = {};
							if (this.stores[item].params) {
								lang.mixin(config, this.stores[item].params);
							}
							// we assume the store is here through dependencies
							var StoreCtor;
							try {
								StoreCtor = require(type);
							} catch (e) {
								throw new Error(type + " must be listed in the dependencies");
							}
							if (config.data && lang.isString(config.data)) {
								//get the object specified by string value of data property
								//cannot assign object literal or reference to data property
								//because json.ref will generate __parent to point to its parent
								//and will cause infinitive loop when creating StatefulModel.
								config.data = lang.getObject(config.data);
							}
							if (this.stores[item].observable) {
								var observableCtor;
								try {
									observableCtor = require("dojo/store/Observable");
								} catch (e) {
									throw new Error("dojo/store/Observable must be listed in the dependencies");
								}
								this.stores[item].store = observableCtor(new StoreCtor(config));
							} else {
								this.stores[item].store = new StoreCtor(config);
							}
							this.loadedStores[item] = this.stores[item].store;
						}
					}
				}
			},

			createControllers: function (controllers) {
				// summary:
				//		Create controller instance
				//
				// controllers: Array
				//		controller configuration array.
				// returns:
				//		controllerDeferred object

				if (controllers) {
					var requireItems = [];
					for (var i = 0; i < controllers.length; i++) {
						requireItems.push(controllers[i]);
					}

					var def = new Deferred();
					var requireSignal;
					try {
						requireSignal = require.on("error", function (error) {
							if (def.isResolved() || def.isRejected()) {
								return;
							}
							def.reject("load controllers error." + error);
							requireSignal.remove();
						});
						require(requireItems, function () {
							def.resolve.call(def, arguments);
							requireSignal.remove();
						});
					} catch (e) {
						def.reject(e);
						if (requireSignal) {
							requireSignal.remove();
						}
					}

					var controllerDef = new Deferred();
					when(def, lang.hitch(this, function () {
						for (var i = 0; i < arguments[0].length; i++) {
							// instantiate controllers, set Application object, and perform auto binding
							this.loadedControllers.push((new arguments[0][i](this)).bind());
						}
						controllerDef.resolve(this);
					}), function () {
						//require def error, reject loadChildDeferred
						controllerDef.reject("load controllers error.");
					});
					return controllerDef;
				}
			},

			// setup default view and Controllers and startup the default view
			start: function () {
				//
				//create application level data store
				this._createDataStore();
				this.setupControllers();
				// if available load root NLS
				when(nls(this), lang.hitch(this, function (nls) {
					if (nls) {
						lang.mixin(this.nls = {}, nls);
					}
					this.startup();
				}));
			},

			setDomNode: function (domNode) {
				var oldNode = this.domNode;
				this.domNode = domNode;
				this.emit("app-domNode", {
					oldNode: oldNode,
					newNode: domNode
				});
			},

			setupControllers: function () {
				// create application controller instance
				// move set _startView operation from history module to application
				var currentHash = window.location.hash;
				this._startView = hash.getTarget(currentHash, this.defaultView);
				this._startParams = hash.getParams(currentHash);
			},

			startup: function () {
				// load controllers and views
				//
				this.selectedChildren = {};
				var controllers = this.createControllers(this.controllers);
				// constraint on app
				if (this.hasOwnProperty("constraint")) {
					constraints.register(this.constraints);
				} else {
					this.constraint = "center";
				}
				var emitLoad = function () {
					// emit "app-load" event and let controller to load view.
					this.emit("app-load", {
						viewId: this.defaultView,
						initLoad: true,
						params: this._startParams,
						callback: lang.hitch(this, function () {
							this.emit("app-transition", {
								viewId: this.defaultView,
								forceTransitionNone: true, // we want to avoid the transition on the 1st default view.
								opts: { params: this._startParams }
							});
							if (this.defaultView !== this._startView) {
								// transition to startView. If startView==defaultView, then initial is the default view.
								this.emit("app-transition", {
									viewId: this._startView,
									opts: { params: this._startParams }
								});
							}
							this.setStatus(this.lifecycle.STARTED);
						})
					});
				};
				when(controllers, lang.hitch(this, function () {
					if (this.template) {
						// emit "app-init" event so that the Load controller can initialize root view
						this.emit("app-init", {
							app: this,	// pass the app into the View so it can have easy access to app
							name: this.name,
							type: this.type,
							parent: this,
							templateString: this.templateString,
							controller: this.controller,
							callback: lang.hitch(this, function (view) {
								this.setDomNode(view.domNode);
								emitLoad.call(this);
							})
						});
					} else {
						emitLoad.call(this);
					}
				}));
			}
		});

		function generateApp(config, node) {
			// summary:
			//		generate the application
			//
			// config: Object
			//		app config
			// node: domNode
			//		domNode.
			var path;

			// call configProcessHas to process any has blocks in the config
			config = configUtils.configProcessHas(config);

			if (!config.loaderConfig) {
				config.loaderConfig = {};
			}
			if (!config.loaderConfig.paths) {
				config.loaderConfig.paths = {};
			}
			if (!config.loaderConfig.paths.app) {
				// Register application module path
				path = window.location.pathname;
				if (path.charAt(path.length) !== "/") {
					path = path.split("/");
					path.pop();
					path = path.join("/");
				}
				config.loaderConfig.paths.app = path;
			}
			require(config.loaderConfig);

			if (!config.modules) {
				config.modules = [];
			}
			// add dapp lifecycle module by default
			config.modules.push("./modules/lifecycle");
			var modules = config.modules.concat(config.dependencies ? config.dependencies : []);

			if (config.template) {
				path = config.template;
				if (path.indexOf("./") === 0) {
					path = "app/" + path;
				}
				modules.push("dojo/text!" + path);
			}

			require(modules, function () {
				var modules = [Application];
				for (var i = 0; i < config.modules.length; i++) {
					modules.push(arguments[i]);
				}

				var ext;
				if (config.template) {
					ext = {
						templateString: arguments[arguments.length - 1]
					};
				}
				/*global App:true */
				App = declare(modules, ext);


				domReady(function () {
					var app = new App(config, node || win.body());

					if (has("app-log-api")) {
						app.log = function () {
							// summary:
							//		If config is set to turn on app logging, then log msg to the console
							//
							// arguments:
							//		the message to be logged,
							//		all but the last argument will be treated as Strings and be concatenated together,
							//      the last argument can be an object it will be added as an argument to console.log
							var msg = "";
							try {
								for (var i = 0; i < arguments.length - 1; i++) {
									msg = msg + arguments[i];
								}
								console.log(msg, arguments[arguments.length - 1]);
							} catch (e) {
							}
						};
					} else {
						app.log = function () {
						}; // noop
					}

					app.setStatus(app.lifecycle.STARTING);
					// Create global namespace for application.
					// The global name is application id. For example, modelApp
					var globalAppName = app.id;
					if (window[globalAppName]) {
						lang.mixin(app, window[globalAppName]);
					}
					window[globalAppName] = app;
					app.start();
				});
			});
		}

		return function (config, node) {
			if (!config) {
				throw new Error("App Config Missing");
			}

			generateApp(config, node);
		};
	});
