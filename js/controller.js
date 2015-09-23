angular.module('availabilityApp.controllers', ['ngRoute'])
	
	.config(function($routeProvider) {
		$routeProvider
			.when('/availability', {
				controller: 'AvailabilityCtrl',
				templateUrl: chrome.runtime.getURL('templates/availability.html')
			})
			.when('/settings', {
				controller: 'AvailabilityCtrl',
				templateUrl: chrome.runtime.getURL('templates/settings.html')
			})
			.when('/login', {
				controller: 'AvailabilityCtrl',
				templateUrl: chrome.runtime.getURL('templates/login.html')
			})
			.otherwise({
				redirectTo:'/availability'
			});
	})

	.controller('AvailabilityCtrl', ['$scope', 'hueService', '$http', '$location', function($scope, hueService, $http, $location) {
		
		var GCM_SENDER_ID = "72565097277";
		var API_KEY = "AIzaSyAc4OUoIUkHdOq0Iuc3Y7yZqyIspD-WJYU";
		var SHAUN_REG_ID = "APA91bEEflGWVnz8f0dh9X9pK4P_ZIjq5w7YZlPVGqbn7Vv0BmaJvuIHoNkpGKMD7FywvfnQdBhkrKMVOzUbdxG-AOzOTYa8k0jDvoRnAw2IMs3-mlh1GpVKOOIKzl55kQ4E7p2kTBszsvAujkniesmhPqVU4Fe5jH2vYPImg4gx937sbc8koiM";
		
		var NOTIFICATION_TYPES = {
			ERROR : 'ERROR'
		};
		
		$scope.AVAILABILITY = {
			BUSY : {color: 'red', hueState: {hue: 0, on: true, sat: 255, bri: 255}, label: "Busy"},
			AWAY : {color: 'yellow', hueState: {on: false}, label: "Away"},
			AVAILABLE : {color: 'green', hueState: {hue: 25500, on: true, sat: 255, bri: 255}, label: "Available"}
		};
		
		$scope.HUE_STATES = {
			CONNECTED : {label: "Hue Connected", class: "label-success", icon_class: ""},
			CONNECTING : {label: "Connecting...", class: "label-warning", icon_class: "fa-spin"},
			NOT_CONNECTED : {label: "Hue Not Connected", class: "label-danger", icon_class: ""},
			NOT_CONFIGURED : {label: "Hue Settings Not Configured", class: "label-danger", icon_class: ""},
			NOT_AUTHORIZED : {label: "Hue Not Authorized - Check Settings", class: "label-danger", icon_class: ""},
			AUTHORIZING : {label: "Authorizing... Press Button on Hub", class: "label-warning", icon_class: "fa-spin"}
		};
		
		var HUE_USER_NAME = "availableApp";
		
		//Put the startup code at the top where it's easy to find
		var initialize = function() {
			$scope.status = {};
			
			//Start stuff that doesn't need to wait until the settings have been loaded
			//makeAngularHttpBehaveLikeJquery();
			
			/*Anything that relies on the settings should go in here after the load*/
			chrome.storage.sync.get('settings', function(value) {
				$scope.$apply(function() {
					$scope.$watch("settings", function(newValue, oldValue) {
						save();
						$scope.setHueState();
					}, true);
					load(value);
					startServer();
				});
			});
		};
		
		$scope.changeAvailability = function(availability) {
			if(availability) {
				changeHueColor($scope.settings.hueLightNumber, availability);
				sendMessage($scope.settings.hueLightNumber, availability)
			}
		};
		
		$scope.showPage = function (page) {
			$location.path("/" + page);
		};
		
		//*************GOOGLE CLOUD MESSAGING*************//
		
		var sendMessage = function(lightNumber, availability) {
			$http.post("https://android.googleapis.com/gcm/send",
				JSON.stringify({
					"data": {lightNumber: lightNumber.toString(), availability: availability.label},
					"registration_ids": [SHAUN_REG_ID]
				})
			,{
				headers: {Authorization: "key=" + API_KEY}
			})
			.success(function(data, status) {
				console.log(status);
				console.log(data);
			})
			.error(function(data, status) {
				$scope.showError(status, "GCM Error", "Error sending to GCM");
			});
		};
		
		//*************TEST SERVER*************//
		
		var startServer = function() {
			chrome.sockets.tcpServer.create({}, function(createInfo) {
				listenAndAccept(createInfo.socketId);
			});
		};
		
		var listenAndAccept = function (socketId) {
			chrome.sockets.tcpServer.listen(socketId, "localhost", 2000, null, function(resultCode) {
					onListenCallback(socketId, resultCode);
			});
		};
		
		var onListenCallback = function(socketId, resultCode) {
			if (resultCode < 0) {
				console.log("Error listening:" +
					chrome.runtime.lastError.message);
				return;
			}
			$scope.settings.serverSocketId = socketId;
			chrome.sockets.tcpServer.onAccept.addListener(onAccept);
			chrome.sockets.tcpServer.onAcceptError.addListener(onAcceptError);
		};
		
		var onAccept = function(info) {
			if (info.socketId != $scope.settings.serverSocketId)
				return;
		
			// A new TCP connection has been established.
			chrome.sockets.tcp.send(info.clientSocketId, data,
				function(resultCode) {
					console.log("Data sent to new TCP client connection.");
			});
			// Start receiving data.
			chrome.sockets.tcp.onReceive(info.clientSocketId, onReceive);
			chrome.sockets.tco.setPaused(false);
		};
		
		var onAcceptError = function(info) {
			console.error(info);
		};
		
		//******Storage and Settings*******//
		
		// If there is saved data in storage, use it. Otherwise, bootstrap with defaults
		var load = function(value) {
			if (value && value.settings) {
				$scope.settings = value.settings;
			} else {
				$scope.settings = {
					hueIpAddress: "",
					hueLightNumber: null,
					showHueSettings: true
				};
			}
			
			$scope.notifications = [];
		};
		
		var save = function() {
			if($scope.settings) {
				chrome.storage.sync.set({'settings': $scope.settings
				});
			}
		};
		
		//******Error Handling*******//
		
		$scope.showError = function(status, shortError, longError) {
			$scope.notifications.push({type: NOTIFICATION_TYPES.ERROR, shortError: shortError, longError: longError});
		};
		
		$scope.dismissNotification = function(index) {
			if(index < $scope.notifications.length) {
				$scope.notifications.splice(index, 1);
			}
		};
		
		
		//************CONTROLLING HUE************//
		
		/**
		 * The availability parameter is one of the AVAILABILITY enums
		 */
		var changeHueColor = function(lightNumber, availability) {
			if(!lightNumber || !availability) {
				return;
			}
			hueService.setLightState(
				//URL Parameters
				{
					hueIpAddress: $scope.settings.hueIpAddress,
					lightNumber: lightNumber
				},
				//JSON Body
				JSON.stringify(availability.hueState),
				function(data) {
					//TODO -- handle success or error
				}
			);
		};
		
		//************HUE AUTHORIZATION AND CONFIGURATION************//
		
		$scope.setHueState = function() {
			if($scope.isHueConfigured()) {
				//reset the status so the ui can show a loading icon
				$scope.status.hueState = $scope.HUE_STATES.CONNECTING;
				hueService.status({hueIpAddress:$scope.settings.hueIpAddress, username: HUE_USER_NAME},
					function success(value, responseHeaders) {
						//An error response will be in the form {0: {error: {...}}}
						//Not handling multiple error results
						if(value[0]) {
							var error = value[0].error;
							//Note Authorized
							if(error.type == 1) {
								$scope.status.hueState = $scope.HUE_STATES.NOT_AUTHORIZED;
							}
							else {
								$scope.showError(status, "Hue Error", "There was an error attempting to connect to the Hue hub. Type: " + error.type + " Description: " + error.description);
								$scope.status.hueState = $scope.HUE_STATES.NOT_CONNECTED;
							}
						}
						else if(angular.isObject(value)) {
							$scope.status.hueState = $scope.HUE_STATES.CONNECTED;
							$scope.status.hueStatus = value;
						}
					},
					function error(httpResponse) {
						$scope.showError(status, "Hue Error", "There was an error attempting to connect to the Hue hub. You might need to check your settings.");
						$scope.status.hueState = $scope.HUE_STATES.NOT_CONNECTED;
					}
				);
			}
			else {
				$scope.status.hueState = $scope.HUE_STATES.NOT_CONFIGURED;
			}
		};
		
		$scope.isHueConfigured = function() {
			return $scope.settings.hueIpAddress && $scope.settings.hueLightNumber;
		};
		
		$scope.authorizeHue = function() {
			//todo -- we could poll here but we I can't get the listener off the alarms
			//and the shortest period is 1 minute...
			$scope.status.hueState = $scope.HUE_STATES.AUTHORIZING;
			hueService.newUser(
				//URL Parameters
				{
					hueIpAddress: $scope.settings.hueIpAddress
				},
				//JSON Body
				JSON.stringify({"devicetype":"Chrome Application","username":HUE_USER_NAME}),
				function success(value, responseHeaders) {
					//Expected one element in the array in either case
					var result = value[0];
					if(result.success) {
						//todo -- better messaging
						$scope.showError(status, "Success", "The application has been authorized with the hub.");
						$scope.showPage("availability");
						return;
					}
					else if(result.error && result.error.type == 101) {
						//This is expected... we just wait for them to push the button then push the "I've pushed the button" button
						return;
					}
					else{
						$scope.showError(status, "Hue Error", "There was an error attempting to authorize with the Hue hub.");
						console.error("Error value: ");
						console.error(value);
					}
				},
				function error(httpResponse) {
					$scope.showError(status, "Hue Error", "There was an error attempting to authorize with the Hue hub.");
				}
			);
		};
		
		$scope.cancelAuthorizeHue = function() {
			$scope.status.hueState = $scope.HUE_STATES.NOT_AUTHORIZED;
		};
		
		$scope.hueButtonPressed = function() {
			hueService.newUser(
				//URL Parameters
				{
					hueIpAddress: $scope.settings.hueIpAddress
				},
				//JSON Body
				JSON.stringify({"devicetype":"Chrome Application","username":HUE_USER_NAME}),
				function success(value, responseHeaders) {
					//Expected one element in the array in either case
					var result = value[0];
					if(result.success) {
						//todo -- better messaging
						$scope.showError(status, "Success", "The application has been authorized with the hub.");
						$scope.showPage("availability");
						return;
					}
					else if(result.error && result.error.type == 101) {
						$scope.showError(status, "Hue Error", "There was an error attempting to authorize with the Hue hub. You might want to press the button again.");
						console.error("Error value: ");
						console.error(value);
					}
					else{
						$scope.showError(status, "Hue Error", "There was an error attempting to authorize with the Hue hub.");
						console.error("Error value: ");
						console.error(value);
					}
				},
				function error(httpResponse) {
					$scope.showError(status, "Hue Error", "There was an error attempting to authorize with the Hue hub.");
				}
			);
		};
		
		//*****************ANGULAR STUFF*****************//
		
		// See http://victorblog.com/2012/12/20/make-angularjs-http-service-behave-like-jquery-ajax/
		var makeAngularHttpBehaveLikeJquery = function() {
			$http.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded;charset=utf-8';
			
			/**
			* The workhorse; converts an object to x-www-form-urlencoded serialization.
			* @param {Object} obj
			* @return {String}
			*/
			var param = function(obj) {
				var query = '', name, value, fullSubName, subName, subValue, innerObj, i;
				
				for(name in obj) {
					value = obj[name];
					
					if(value instanceof Array) {
					for(i=0; i<value.length; ++i) {
						subValue = value[i];
						fullSubName = name + '[' + i + ']';
						innerObj = {};
						innerObj[fullSubName] = subValue;
						query += param(innerObj) + '&';
					}
				}
				else if(value instanceof Object) {
					for(subName in value) {
						subValue = value[subName];
						fullSubName = name + '[' + subName + ']';
						innerObj = {};
						innerObj[fullSubName] = subValue;
						query += param(innerObj) + '&';
					}
				}
				else if(value !== undefined && value !== null)
					query += encodeURIComponent(name) + '=' + encodeURIComponent(value) + '&';
				}
			
				return query.length ? query.substr(0, query.length - 1) : query;
			};
			// Override $http service's default transformRequest
			$http.defaults.transformRequest = [function(data) {
				return angular.isObject(data) && String(data) !== '[object File]' ? param(data) : data;
			}];
		};
		
		initialize();
	}]);