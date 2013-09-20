define(["dojo/dom"], function(dom){
	return {
		beforeActivate: function(previousView, data){
			dom.byId("label").innerHTML = previousView.id + (data ? ("-" + data) : "");
		}
	}
});