define([
	"intern!object",
	"intern/chai!assert",
	"dapp/main",
	"dojo/json",
	"dojo/topic",
	"dojo/text!dapp/tests/unit/simple.json"
], function (registerSuite, assert, main, json, topic, config) {
	var container;

	registerSuite({
		name: "init",
		setup: function () {
			container = document.createElement("div");
			document.body.appendChild(container);
		},
		"basic tests getChildren" : function () {
			var d = this.async(1000);
			main(json.parse(config), container);
			// TODO App construction method should probably return a promise which would make all of this a bit simpler
			topic.subscribe("/app/status", function (status) {
				if (status === 2) {
					// we are ready to test
					// check the DOM state to see if we are in the expected state

					// test is finished resolved the deferred
					d.resolve();
				}
			});
			return d;
		},
		teardown: function () {
			container.parentNode.removeChild(container);
		}
	});
});
