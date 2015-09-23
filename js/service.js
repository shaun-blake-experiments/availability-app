var services = angular.module('availabilityApp.services', ['ngResource']);

services.hueResponseTransformer = function(data, headers) {
	//Since the result we want is an object, but an error comes
	//as an array we need to mess with the error version since
	//angular resources need one type or the other.
	var parsedData = JSON.parse(data);
	if(angular.isArray(parsedData)) {
		//Convert [{blah}, {blah}] to {1: {blah}, 2: {blah}}
		var objectVersion = {};
		for (var i = 0; i < parsedData.length; ++i) {
			objectVersion[i] = parsedData[i];
		}
		return objectVersion;
	}
	else {
		return parsedData;
	}
}

services.factory('hueService', ['$resource',
	function($resource){
		return $resource('', {}, {
			status: {
				method:'GET',
				params:{hueIpAddress:'@hueIpAddress', username: '@username'},
				url: 'http://:hueIpAddress/api/:username',
				isArray: false,
				transformResponse: services.hueResponseTransformer
			},
			newUser: {
				method:'POST',
				params:{hueIpAddress:'@hueIpAddress'},
				url: 'http://:hueIpAddress/api',
				isArray: true
			},
			setLightState: {
				method:'PUT',
				params:{hueIpAddress:'@hueIpAddress', lightNumber:'@lightNumber'},
				isArray:true,
				url: 'http://:hueIpAddress/api/newdeveloper/lights/:lightNumber/state'
			}
		});
	}]
);

//TODO -- first try http method
services.factory('gcmService', ['$resource',
	function($resource){
		return $resource('', {}, {
			headers: { 'something': 'anything' },
			sendMessage: {
				method:'POST',
				params:{},
				url: 'https://android.googleapis.com/gcm/send',
				isArray: false,
				transformResponse: services.hueResponseTransformer
			}
		});
	}]
);