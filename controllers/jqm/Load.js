define(["../../Controller", "dojo/_base/declare", "dojo/_base/lang"], function(Controller, declare, lang){
	var regexp = /[^/]*$/;
	return declare(Controller, {
		constructor: function(){
			//this.bind(document, "pagebeforeload", lang.hitch(this, this.onPageBeforeLoad));
			$(document).bind("pagebeforeload", lang.hitch(this, this.onPageBeforeLoad));

		},
		onPageBeforeLoad: function(event, data){
			event.preventDefault();
			this.app.emit("app-load", {
				"viewId": regexp.exec(data.dataUrl)[0],
				"callback": function(view){
					//view.beforeActivate();
					$("#"+view.id).page();
					data.deferred.resolve(data.absUrl, data.options, $("#"+view.id));
				}
			});
		}
	});
});