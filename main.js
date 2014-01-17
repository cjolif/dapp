define(["require", "dojo/_base/kernel", "dojo/_base/lang", "dojo/_base/declare", "dojo/_base/config",
	"dojo/Evented", "dojo/Deferred", "dojo/when", "dojo/has", "dojo/on", "dojo/domReady",
	"dojo/dom-construct", "dojo/dom-attr", "./utils/nls", "./modules/lifecycle",
	"./utils/hash", "./utils/constraints", "./utils/config"],
	function (require, kernel, lang, declare, config, Evented, Deferred, when, has, on, domReady,
			  domConstruct, domAttr, nls, lifecycle, hash, constraints, configUtils) {

		has.add("app-log-api", (config.app || {}).debugApp);

		var Application = declare(Evented, {
			constructor: function (params, node) {
				lang.mixin(this, params);
				this.domNode = node;
				this.children = {};
				this.loadedStores = {};
			},

			displayView: function (view, params) {
				// TODO: complete implementation
				var opts = lang.mixin({ bubbles: true, cancelable: true, dest: view },
					params ? params : {transition: "slide", direction: "end"});
				on.emit(document, "delite-display", opts);
			},

			hideView: function () {
				// TODO hide should either just hide or optionally unload it as well
			},

			// TODO: move to a Store controller?
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
							new arguments[0][i](this).bind();
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
				when(controllers, lang.hitch(this, function () {
					// emit "app-init" event so that the Init controller can initialize the app and the root view
					this.emit("app-init", {});
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
			require(config.loaderConfig);

			if (!config.modules) {
				config.modules = [];
			}

			var modules = config.modules.concat(config.dependencies ? config.dependencies : []);

			if (config.template) {
				path = config.template;
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

				var App = declare(modules, ext);

				domReady(function () {
					var app = new App(config, node || document.body);

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

					if (app.setStatus) {
						// only use lifecyle module if present
						app.setStatus(app.lifecycle.STARTING);
					}

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
				throw new Error("Application Configuration Missing");
			}
			generateApp(config, node);
		};
	});
