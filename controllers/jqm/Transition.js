define(["require", "dojo/_base/lang", "dojo/_base/declare", "../../Controller"],
	function(require, lang, declare, Controller){
	return declare(Controller, {

		constructor: function(app, events){
			// summary:
			//		bind "app-transition" event on application instance.
			//
			// app:
			//		dojox/app application instance.
			// events:
			//		{event : handler}
			this.events = {
				"app-transition": this.transition
			};
			$(document).bind("pagebeforeshow", lang.hitch(this, this.onPageBeforeShow));
			$(document).bind("pagehide", lang.hitch(this, this.onPageHide));
			$(document).bind("pageshow", lang.hitch(this, this.onPageShow));
		},

		onPageBeforeShow: function(event, data){
			// workaround we consider all views are top level for now
			this.app.children[event.target.id].beforeActivate(this.app.children[data.prevPage.attr("id")]);
			// first time from might be null
			this.app.children[data.prevPage.attr("id")] && this.app.children[data.prevPage.attr("id")].beforeDeactivate();
		},

		onPageHide: function(event, data){
			// first time from might be null
			this.app.children[event.target.id] && this.app.children[event.target.id].afterDeactivate();
		},

		onPageShow: function(event, data){
			this.app.children[event.target.id].afterActivate();
		},

		transition: function(event){
			$.mobile.changePage(event.viewId);
		}
	});
});
