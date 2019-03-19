/*
 * Copyright (c) 2016 VMware, Inc. All Rights Reserved.
 * This software is released under MIT license.
 * The full license information can be found in LICENSE in the root directory of this project.
 */
(function(angular) {

    "use strict";

    var serviceName = "apis";

    service.$inject = ["$base64", "$http", "$q", "$rootScope", "$cacheFactory", "$timeout", "filterFilter" ];

    var SLASH_RE = new RegExp('[/ ]+', 'g');
    var CURLY_REMOVE_RE = new RegExp('[{}]+', 'g');
    var SWAGGER_PATH_DASH_RE = new RegExp('-', 'i');
    var SWAGGER_PATH_WS_RE = new RegExp('[ \t]', 'i');
    var SWAGGER_PATH_SLASH_RE = new RegExp('/', 'i');
    var NOT_ALNUM_RE = new RegExp('[^A-Za-z0-9]+', 'i');

    function service($base64, $http, $q, $rootScope, $cacheFactory, $timeout, filterFilter) {

        var cache = $cacheFactory(serviceName);

        var emptyResult = {
            apis : [],
            filters : {
                products : [],
                languages : [],
                types : [],
                sources : []
            }
        };

        // aaron note: I don't know if this is the best way to declare utility code.  perhaps this should be in a
        // separate file and not in this service file?
        var utils = {
            getCodeClientHttpHeaders : function() {
                var _headers = {};
                if ($rootScope.settings.clientID) {
                    _headers['X-VMware-Code-Client'] = $rootScope.settings.clientID;
                }
                if ($rootScope.settings.clientUUID) {
                    _headers['X-VMware-Code-Client-UUID'] = $rootScope.settings.clientUUID;
                }
                if ($rootScope.settings.clientUserID) {
                    _headers['X-VMware-Code-User'] = $rootScope.settings.clientUserID;
                }
                return _headers;
            },
            createDisplayStringForProducts : function(products) {
                var productDisplayString = "";
                // create a display string to be used in the list view
                if (products && products.length > 0) {
                    productDisplayString = products.join(",").replace(new RegExp(";", 'g')," ");
                }
                return productDisplayString;
            },
            createProductListNoVersions : function(products) {
                var productListNoVersions = [];
                angular.forEach(products, function (product, index) {
                    var productPair = product.split(";");
                    productListNoVersions.push(productPair[0]);
                });
                return productListNoVersions;
            },
            // this utility function is to work around an issue with insecure certificates on vdc-download.vmware.com.
            // As it turns on we figured out that in fact the certificate is OK, but this is a bug in many webkit browsers
            // including Chrome.  For Chrome browsers version 57 or later is needed (63 has the issue).  It seems that it
            // is also an issue for Safari.
            fixVMwareDownloadUrl : function(url) {
               return url;
               // if (url) {
               //     return url.replace("vdc-download", "vdc-repo");
               // } else {
               //     return url;
               // }
            },
            /**
             * create a swagger operation id from the method path such as /endpoints/types/extensions/{id}
             to get_endpoints_types_extensions_id
             */
            swagger_path_to_operationId : function(httpMethod, swaggerOperationPath) {
                if (!swaggerOperationPath) {
                    return "";
                }
                var pathOperationId = swaggerOperationPath;
                pathOperationId = pathOperationId.replace(CURLY_REMOVE_RE,'');
                pathOperationId = pathOperationId.replace(SLASH_RE,'_');
                return httpMethod + pathOperationId;
            },
            /**
             *  make sure operation id is valid in case user messed it up
             * @param operationId
             */
            swagger_fix_operationId : function(operationId) {
                if (!operationId) {
                    return "";
                }
                operationId = operationId.trim();
                operationId = operationId.replace(NOT_ALNUM_RE,'_');
                return operationId;
            },
            createUrlForSwaggerMethod : function(apiUrl, methodType, methodPath, tag, operationId) {
                // I don't understand the pattern, but this is what swagger does, it puts the tag at the beginning of the method, and then
                // puts '45' for dashes, '47' for slashes and '32' for spaces, which appears to be the decimal for the ASCII char value, odd.  I guess this is their
                // own sort of URL encoding, albeit really stange.
                // TODO improve this algorithm to handle other characters as well.
                var tagOperationId = null;
                if (tag) {
                    tagOperationId = tag.replace(SWAGGER_PATH_DASH_RE, '45');
                    tagOperationId = tagOperationId.replace(SWAGGER_PATH_WS_RE, '32');
                    tagOperationId = tagOperationId.replace(SWAGGER_PATH_SLASH_RE, '47');
                }

                if (!operationId || operationId == "undefined") {
                    operationId = utils.swagger_path_to_operationId(methodType, methodPath)
                } else {
                    operationId = utils.swagger_fix_operationId(operationId);
                }

                var url = apiUrl + '?!/';
                if (tagOperationId) {
                    url = url + tagOperationId + '/';
                }
                url = url + operationId;
                return url;
            }
        };

        var definitions = {
                // This is for vSphere only
                vspherelogin : function(username, password, authUrl) {
                    var deferred = $q.defer();
                    var result = angular.merge({}, emptyResult);

                    var _authdata = $base64.encode(username + ':' + password);
                    var _headers = {
                        'Authorization': 'Basic ' + _authdata,
                        'vmware-use-header-authn' : 'apiexplorer'
                    };

                    $http({
                        method : 'POST',
                        url : authUrl,
                        headers: _headers
                    }).then(function(response) {
                        result.value = response.data.value;
                    }).finally(function() {
                        deferred.resolve(result);
                    });

                    return deferred.promise;
                },

                // This is for vSphere only
                vspherelogout : function(sessionId, authUrl) {
                    var deferred = $q.defer();
                    var result = angular.merge({}, emptyResult);

                    var _headers = {
                        'vmware-api-session-id' : sessionId
                    };

                    $http({
                        method : 'DELETE',
                        url : authUrl,
                        headers: _headers
                    }).then(function(response) {
                        result = response.data;
                        deferred.resolve(result);
                    }).finally(function() {
                        console.log('Failed to logout')
                        deferred.resolve(result);
                    });

                    return deferred.promise;
                },
                // This is for vRA only
                vralogin : function(username, password, tenant, authUrl) {
                    var deferred = $q.defer();
                    var result = angular.merge({}, emptyResult);

                    //var _authdata = $base64.encode(username + ':' + password);
                    //var _headers = {
                    //    'Authorization': 'Basic ' + _authdata,
                    //    'vmware-use-header-authn' : 'apiexplorer'
                    //};
                    // this is vRA SSO specific
                    var _data = {
                        "username" : username,
                        "password" : password,
                        "tenant"   : tenant
                    };

                    $http({
                        method : 'POST',
                        url : authUrl,
                        data: _data
                    }).then(function(response) {

                        // return value looks like this:
                        // {
                        //    "expires": "2017-08-18T22:59:26.000Z",
                        //    "id": "MTUwMzA2ODM2NjU2MDoxODA1OTY4OWEzODVjMTRiNjg0ZDp0ZW5hbnQ6dnNwaGVyZS5sb2NhbHVzZXJuYW1lOmFkbWluaXN0cmF0b3JAdnNwaGVyZS5sb2NhbGV4cGlyYXRpb246MTUwMzA5NzE2NjAwMDozMjQ0NzM3YTY5MzM5MmRmOGNmYmJlOTJhMjI0NTE1YjA2ZjM4ZTFmOWUyN2MxNjlkNDMwOGVlMjY5OGJiZTY2MDdkOTAwMjRjYjBjOWJmMWFkM2U5MjMyOWM1OGJlNGM4MmExYjMzNTc2N2M3YzMwYjU5ZWY4ZTdlNDFiMTg0ZA==",
                        //    "tenant": "vsphere.local"
                        //}

                        result.value = response.data.id;
                    }).finally(function() {
                        deferred.resolve(result);
                    });

                    return deferred.promise;
                },

                // This is for vRA only
                vralogout : function(sessionId, authUrl) {
                    var deferred = $q.defer();
                    var result = angular.merge({}, emptyResult);

                    var _headers = {
                        'Authorization': 'Token ' + sessionId,
                    };

                    var url = authUrl + "/" + sessionId;

                    //var _authdata = $base64.encode(username + ':' + password);
                    //var _headers = {
                    //
                    //    'vmware-use-header-authn' : 'apiexplorer'
                    //};

                     // https://{{va-fqdn}}/identity/api/tokens/{{token}}
                    $http({
                        method : 'DELETE',
                        url : url,
                        headers: _headers
                    }).then(function(response) {
                        result = response.data;
                        deferred.resolve(result);
                    }).finally(function() {
                        console.log('Failed to logout')
                        deferred.resolve(result);
                    });

                    return deferred.promise;
                },
                /**
                 *  Assuming that the URL is absolute or relative for swagger json, return a promise for the value
                 * @param url
                 */
                getSwaggerJson : function(url) {
                   var deferred = $q.defer();
                   var result = {data:null};

                   // see if we have this json cached already
                   var cachedJson = sessionStorage.getItem(url);
                   if (cachedJson) {
                       console.log("getSwaggerJson('" + url + "') CACHE HIT");
                       result.data = JSON.parse(cachedJson);

                       //console.log("RAW cached value:");
                       //console.log(result.data);
                       deferred.resolve(result);
                   } else {
                        console.log("getSwaggerJson('" + url + "') GET");
                        $http({
                            method : 'GET',
                            url : url
                        }).then(function(response) {
                            console.log("getSwaggerJson('" + url + "') RESULT");
                            result.data = response["data"];

                            //console.log("getSwaggerJson RAW result.data:");
                            //console.log(result.data);

                            // add to the cache if enabled
                            if ($rootScope.settings.enableSessionStorageCache) {
                                try {
                                    sessionStorage.setItem(url, JSON.stringify(result.data));
                                } catch(e) {
                                    console.log("Exception in sessionStorage.setItem. Setting enableSessionStorageCache=false");
                                    $rootScope.settings.enableSessionStorageCache = false;
                                }

                            }
                        }).finally(function() {
                            deferred.resolve(result);
                        });
                    }
                    return deferred.promise;
                },
                getAllApis : function(){
                    var cacheKey = "allApis";
                    var deferred = $q.defer();

                    var result = cache.get(cacheKey);

                    if (result) {
                        deferred.resolve(result);
                    } else {
                        var result = angular.merge({}, emptyResult);

                        // Combine all API sources into a single result
                        $q.all([definitions.getRemoteApis(), definitions.getLocalApis()]).then(function(responses){
                            angular.forEach(responses, function(response, index) {
                                result.filters.products.pushUnique(response.filters.products, true);
                                result.filters.languages.pushUnique(response.filters.languages, true);
                                result.filters.types.pushUnique(response.filters.types, true);
                                result.filters.sources.pushUnique(response.filters.sources, true);
                                result.apis = result.apis.concat(response.apis);
                            });
                        }).finally(function() {
                            cache.put(cacheKey, result);
                            deferred.resolve(result);
                        });
                    }

                    return deferred.promise;
                },
                getRemoteApis : function(){
                    var deferred = $q.defer();
                    var result = angular.merge({}, emptyResult);

                    $http({
                        method : 'GET',
                        url : $rootScope.settings.remoteApisEndpoint + '/apis',
                        headers: utils.getCodeClientHttpHeaders()
                    }).then(function(response) {
                        angular.forEach(response.data, function(value, index) {
                        	var source = "remote";
                            // Get type and products from tags
                            var type = "swagger";
                            var products = [];
                            var languages = [];
                            var apiGroup = "";
                            var add = false;

                            if (value.tags && value.tags.length > 0) {
                                if (angular.isArray(value.tags)) {
                                    type = filterFilter(value.tags, {category: "display"}, true)[0].name;
                                    var apiGroupTags = filterFilter(value.tags, {category: "api-group"}, true);

                                    if (apiGroupTags && apiGroupTags.length > 0) {
                                        apiGroup = apiGroupTags[0].name;
                                    }
                                    angular.forEach(filterFilter(value.tags, {category: "product"}, true), function(value, index) {
                                    	products.push(value.name);
                                    });

                                    angular.forEach(filterFilter(value.tags, {category: "programming-language"}, true), function(value, index) {
                                    	languages.push(value.name);
                                    });
                                }
                            }

                            // Clean the type
                            if (type == "iframe-documentation" || (value.api_ref_doc_url && value.api_ref_doc_url.endsWith(".html"))) {
                           		type = "html";
                            }

                            // for the resulting API, set the product list such that version numbers are removed.  this only
                            // effects filtering

                            result.apis.push({
                            	id: parseInt(value.id, 10),
                                name: value.name,
                        	    version: value.version,
                        	    api_uid: value.api_uid,
                        	    description: value.description,
                        	    url: utils.fixVMwareDownloadUrl(value.api_ref_doc_url),
                        	    type: type,
                        	    products: utils.createProductListNoVersions(products),
                                productDisplayString: utils.createDisplayStringForProducts(products),
                                languages: languages,
                            	source: source,
                                apiGroup: apiGroup
                            });

                        });

                    }).finally(function() {
                        deferred.resolve(result);
                    });

                    return deferred.promise;
                },
                getLocalApis : function(){
                    var deferred = $q.defer();

                    var result = angular.merge({}, emptyResult);

                    $http({
                        method : 'GET',
                        url : $rootScope.settings.localApisEndpoint
                    }).then(function(response) {
                        angular.forEach(response.data.apis, function(value, index) {
                            value.id = 10000 + index;
                            value.source = "local";

                            // if the local api did not provide an explict type, then
                            // try to figure it out from the url spec file
                            if (!value.type || 0 === value.type.length) {
	                            if (value.url && value.url.endsWith(".json")) {
	                                value.type = "swagger";
	                            } else if (value.url && value.url.endsWith(".raml")) {
	                                value.type = "raml";
	                            } else {
	                                value.type = "html";
	                            }
                            }

                            // create a display string to be used in the list view
                            value.productDisplayString = utils.createDisplayStringForProducts(value.products);

                            // remove version numbers from the products on the api for filter purposes
                            value.products = utils.createProductListNoVersions(value.products);

                            // tags
                            var languages = [];
                            if (value.tags && value.tags.length > 0) {
                                if (angular.isArray(value.tags)) {
                                    angular.forEach(filterFilter(value.tags, {category: "programming-language"}, true), function(value, index) {
                                        languages.push(value.name);
                                    });
                                }
                            }
                            value.languages = languages;

                            result.filters.products.pushUnique(value.products, true);
                            result.filters.languages.pushUnique(value.languages, true);
                            result.filters.types.pushUnique(value.type);
                            result.filters.sources.pushUnique(value.source);

                            var apiUrl = "#!/apis/" + value.id;

                            // Previously we added API details to search content here.  We are going to defer
                            // indexing the files here and index them when the files come back via callback.
                            value.methods = [];
                            
                            result.apis.push(value);
                        });

                    }).finally(function() {
                        deferred.resolve(result);
                    });

                    return deferred.promise;
                },
                // return a promise for an object that has "resources" map object that has "sdks", and "docs" keys
                // to lists of sdk and docs resource objects.
                getRemoteApiResources : function(apiId){
                	var deferred = $q.defer();
                    var result = {resources:{}};

                    $http({
                        method : 'GET',
                        url : $rootScope.settings.remoteApisEndpoint + '/apis/' + apiId + '/resources',
                        headers: utils.getCodeClientHttpHeaders()
                    }).then(function(response) {

                    	var sdks = [];
                        var docs = [];

                        var setArray = function(resourceType, arr, value) {
                        	if (value.resource_type == resourceType) {

                        	    // make the title of the item included a version if there was one provided
                                // and the name doesn't already end with the version string
                                var title = value.name;
                        	    if (value.version && !title.endsWith(value.version)) {
                        	        title = title + " " + value.version;
                                }

                        		arr.push({
                                	title: title,
                                    version: value.version,
                                    webUrl: utils.fixVMwareDownloadUrl(value.web_url),
                                    downloadUrl: utils.fixVMwareDownloadUrl(value.download_url),
                                    categories: value.categories,
                                    tags: value.tags
                                });
                            }
                        }

                        angular.forEach(response.data, function(value, index) {
                            setArray("SDK", sdks, value);
                            setArray("DOC", docs, value);
                        });

                        if (sdks.length || docs.length) {
                            console.log("got " + sdks.length + " sdks, " + docs.length + " docs");
                            if (sdks.length) {
                             	result.resources.sdks = sdks;
                            }
                        	if (docs.length) {
                        		result.resources.docs = docs;
                        	}
                        }
                    }).finally(function() {
                        deferred.resolve(result);
                    });

                    return deferred.promise;
                },
                getSamples : function(platform){
                	var deferred = $q.defer();
                    var result = null;
                    if (!platform) {
                    	return;
                    }

                    var url = $rootScope.settings.remoteSampleExchangeApiEndPoint + '/search/samples?';

                    // aaron note: it seems that the apigw can only support the syntax of having a single instance of
                    // a given query argument, so insteand of multiple platform values, pass all values comma separated.
                    url = url + '&platform=' + encodeURIComponent(platform) + '&summary=true';

                    console.log("Trying to get samples " + url)

                    $http({
                        method : 'GET',
                        url : url,
                        headers: utils.getCodeClientHttpHeaders()
                    }).then(function(response) {
                    	var samples = [];

                        angular.forEach(response.data, function(value, index) {
                        	var tags = [];
                        	if (value.tags) {
                                if (angular.isArray(value.tags)) {

                                    angular.forEach(value.tags, function(tag, index) {
                                        tags.push(tag.name);
                                    });
                                }
                            }
                        	//console.log(tags);
                        	samples.push({
                            	title: value.name,
                            	platform: platform,
                                webUrl: utils.fixVMwareDownloadUrl(value.webUrl),
                                downloadUrl: utils.fixVMwareDownloadUrl(value.downloadUrl),
                                contributor: value.author.communitiesUser,
                                createdDate: value.created,
                                lastUpdated: value.lastUpdated,
                                tags: tags,
                                snippet: value.readmeHtml,
                                favoriteCount: value.favoriteCount
                                //commentCount: 3
                            });
                        });

                        if (samples.length) {
                        	result = {data:{}};
                        	result.data = samples;
                            console.log("got " + samples.length + " samples.")
                        }
                    },function(response) {
                    	var temp = response.data;
                    	console.log(temp);
                    }).finally(function() {
                        deferred.resolve(result);
                    });

                    return deferred.promise;
                },
                /* as the name implies this method calls web service to get a list of available API instances
                * versions from the web service and returns the id of the latest one in the result.data.
                * @return a promise for an object with data = id of the API
                */
                getLatestRemoteApiIdForApiUid : function(api_uid, api_version) {
                    var deferred = $q.defer();
                    var result = {data:null};

                    var endpointUrl=null;
                    if (api_version) {
                        endpointUrl = $rootScope.settings.remoteApisEndpoint + '/apis/uids/' + api_uid + "/versions/" + api_version
                    } else {
                        // legacy no version case
                        endpointUrl = $rootScope.settings.remoteApisEndpoint + '/apis/uids/' + api_uid
                    }

                    console.log("getting APIs using " + endpointUrl)
                    $http({
                        method : 'GET',
                        url : endpointUrl,
                        headers: utils.getCodeClientHttpHeaders()
                    }).then(function(response) {

                        //console.log("got response " + response)

                        // TODO sort through these Api instances and get the latest versions
                        // API id
                        if (response.data && response.data.length > 0) {
                            // TODO delete this debug code eventually
                            angular.forEach(response.data, function(value, index) {
                                console.log("api_uid=" + api_uid + " id=" + value.id + " version=" + value.version);
                            });
                            // get the first one
                            result.data = response.data[response.data.length-1].id;

                        } else {
                            console.log("api_uid=" + api_uid + " has no API instances.");
                        }
                    }).finally(function() {
                        deferred.resolve(result);
                    });
                    return deferred.promise;
                },
                /**
                 * Get the local API group overview path
                 */
                getLocalAPIGroupOverviewPath : function(){
                    var deferred = $q.defer();
                    var result = {data:null};

                    $http({
                        method : 'GET',
                        url : $rootScope.settings.localApisEndpoint
                    }).then(function(response) {
                        result.data = response.data.overview;
                    }).finally(function() {
                        deferred.resolve(result);
                    });
                    return deferred.promise;
                },
                /**
                 * Get the local overview-template.html file as a string and return it as a promise.
                 * String will be present in return objects .data member when resolved.
                 */
                getLocalOverviewTemplate : function(){
                    var deferred = $q.defer();
                    var result = {data:null};
                    //console.log("loading overview template");

                    $http({
                        method : 'GET',
                        url : '/overview-template.html'
                    }).then(function(response) {
                        //console.log("got overview template");
                        result.data = response.data;
                    }).finally(function() {
                        deferred.resolve(result);
                    });
                    return deferred.promise;
                },
                /**
                 * Get the remote overview html as a string and return it as a promise.
                 * String will be present in return objects .data member when resolved.
                 */
                getOverviewBody : function(url){
                    var deferred = $q.defer();
                    var result = {data:null};
                    //console.log("loading overview body");

                    $http({
                        method : 'GET',
                        url : url
                    }).then(function(response) {
                        //console.log("got overview body");
                        result.data = response.data;
                    }).finally(function() {
                        deferred.resolve(result);
                    });
                    return deferred.promise;
                },
                /**
                 *
                 * @param type type of the ref doc, e.g. "swagger", "raml", "iframe"
                 * @param _apiRefDocUrl  the URL to the API reference doc, e.g. http://0.0.0.0:9000/local/swagger/someApi.json
                 * @param _apiUrl the user visible URL to the API itself including the API id, e.g. http://0.0.0.0:9000/#!/apis/10001
                 * @returns {Array}
                 */
                createMethodsForProduct : function(type, _apiRefDocUrl, _apiUrl, callback) {
                    var methods = [];

                    // Add methods for Swagger APIs
                    if(type === 'swagger'){

                        console.log("Starting method load for '" + _apiRefDocUrl + "'");

                        definitions.getSwaggerJson(_apiRefDocUrl).then(function(response) {
                            var data = response.data;

                            //console.log("getSwaggerJson RESPONSE");
                            //console.log(response);

                            var name = data.info.title;
                            var version = data.info.version;
                            $.each(data.paths, function(_k, _v){
                                // here _v is the map of http methods, e.g. "get", "post" to swagger objects. and _k is
                                // the URL/path
                                for(var _httpMethodType in _v){

                                    // there can be multiple tags, which are in theory multiple ways to get at the same
                                    // method.  just pick the first one to create a URL with.
                                    var tag = null;
                                    var tagList = _v[_httpMethodType].tags;
                                    if (tagList && tagList.length > 0) {
                                        tag = tagList[0];
                                    }
                                    var operationId = _v[_httpMethodType].operationId; // may be null

                                    var methodUrl = utils.createUrlForSwaggerMethod(_apiUrl, _httpMethodType, _k, tag, operationId);

                                    // Add filter columns here in the json object if needed
                                    methods.push({ "http_method": _httpMethodType,
                                                    "path": _k,
                                                    "name": name,
                                                    "url" : methodUrl,
                                                    "version": version,
                                                    "summary": _v[_httpMethodType].summary,
                                                    "description": _v[_httpMethodType].description,
                                                    "deprecated": _v[_httpMethodType].deprecated
                                                });
                                    break;
                                }
                            });

                            callback(methods);
                        });
                    }
                }
            };

        return definitions;
    }

    // Service used to fetch the APIs
    angular.module("apiExplorerApp").factory(serviceName, service);

})(angular);
