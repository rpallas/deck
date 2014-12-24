'use strict';


angular.module('deckApp')
  .factory('loadBalancerService', function (searchService, settings, $q, Restangular, _) {

    function loadLoadBalancersByApplicationName(applicationName) {
      return searchService.search('gate', {q: applicationName, type: 'loadBalancers', pageSize: 10000}).then(function(searchResults) {
        return _.filter(searchResults.results, { application: applicationName });
      });
    }

    function loadLoadBalancers(application, loadBalancersByApplicationName) {
      var loadBalancerResults = loadBalancersByApplicationName;

      loadBalancerResults = _.map(loadBalancerResults, function(individualResult) {
        return _.pick(individualResult, 'loadBalancer', 'provider');
      });

      application.accounts.forEach(function(account) {
        var accountClusters = application.clusters[account] || [];

        accountClusters.forEach(function(cluster) {
          cluster.loadBalancers.forEach(function(loadBalancerName) {
            loadBalancerResults.push({loadBalancer: loadBalancerName, provider: cluster.provider});
          });
        });
      });

      loadBalancerResults = _.unique(_.flatten(loadBalancerResults), 'loadBalancer');

      var loadBalancerPromises = [];

      loadBalancerResults.forEach(function(loadBalancer) {
        var loadBalancerPromise = getLoadBalancer(loadBalancer);

        loadBalancerPromises.push(loadBalancerPromise);
      });

      return $q.all(loadBalancerPromises).then(_.flatten);
    }

    function updateHealthCounts(loadBalancer) {
      var instances = loadBalancer.instances;
      loadBalancer.healthCounts = {
        upCount: instances.filter(function (instance) {
          return instance.isHealthy;
        }).length,
        downCount: instances.filter(function (instance) {
          return !instance.isHealthy;
        }).length,
        unknownCount: 0
      };
    }

    function getLoadBalancer(loadBalancer) {
      var promise = Restangular.one('loadBalancers', loadBalancer.loadBalancer).get({provider: loadBalancer.provider});
      return promise.then(function(loadBalancerRollup) {
        if (angular.isUndefined(loadBalancerRollup.accounts)) { return []; }
        var loadBalancers = [];
        loadBalancerRollup.accounts.forEach(function (account) {
          account.regions.forEach(function (region) {
            region.loadBalancers.forEach(function (loadBalancer) {
              loadBalancer.account = account.name;
              loadBalancers.push(loadBalancer);
            });
          });
        });
        return loadBalancers;
      });
    }

    function getLoadBalancerDetails(provider, account, region, name) {
      return Restangular.one('loadBalancers').one(account).one(region).one(name).get({'provider': provider});
    }

    function normalizeLoadBalancersWithServerGroups(application) {
      application.loadBalancers.forEach(function(loadBalancer) {
        var serverGroups = application.serverGroups.filter(function(serverGroup) {
          return serverGroupIsInLoadBalancer(serverGroup, loadBalancer);
        });
        loadBalancer.serverGroups = serverGroups;
        loadBalancer.instances = _(serverGroups).filter({isDisabled: false}).collect('instances').flatten().valueOf();
        updateHealthCounts(loadBalancer);
      });
    }

    function serverGroupIsInLoadBalancer(serverGroup, loadBalancer) {
      return serverGroup.account === loadBalancer.account &&
        serverGroup.region === loadBalancer.region &&
        serverGroup.vpcId === loadBalancer.vpcId &&
        serverGroup.loadBalancers.indexOf(loadBalancer.name) !== -1;
    }

    function convertLoadBalancerForEditing(loadBalancer) {
      var toEdit = {
        editMode: true,
        region: loadBalancer.region,
        credentials: loadBalancer.account,
        listeners: [],
        name: loadBalancer.name,
        regionZones: loadBalancer.availabilityZones
      };

      if (loadBalancer.elb) {
        var elb = loadBalancer.elb;

        toEdit.securityGroups = elb.securityGroups;
        toEdit.vpcId = elb.vpcid;

        if (elb.listenerDescriptions) {
          toEdit.listeners = elb.listenerDescriptions.map(function (description) {
            var listener = description.listener;
            return {
              internalProtocol: listener.instanceProtocol,
              internalPort: listener.instancePort,
              externalProtocol: listener.protocol,
              externalPort: listener.loadBalancerPort
            };
          });
        }

        if (elb.healthCheck && elb.healthCheck.target) {
          toEdit.healthTimeout = elb.healthCheck.timeout;
          toEdit.healthInterval = elb.healthCheck.interval;
          toEdit.healthyThreshold = elb.healthCheck.healthyThreshold;
          toEdit.unhealthyThreshold = elb.healthCheck.unhealthyThreshold;

          var healthCheck = loadBalancer.elb.healthCheck.target;
          var protocolIndex = healthCheck.indexOf(':'),
            pathIndex = healthCheck.indexOf('/');

          if (protocolIndex !== -1 && pathIndex !== -1) {
            toEdit.healthCheckProtocol = healthCheck.substring(0, protocolIndex);
            toEdit.healthCheckPort = healthCheck.substring(protocolIndex + 1, pathIndex);
            toEdit.healthCheckPath = healthCheck.substring(pathIndex);
            if (!isNaN(toEdit.healthCheckPort)) {
              toEdit.healthCheckPort = Number(toEdit.healthCheckPort);
            }
          }
        }
      }
      return toEdit;
    }

    function constructNewLoadBalancerTemplate() {
      return {
        credentials: settings.defaults.account,
        region: settings.defaults.region,
        vpcId: null,
        healthCheckProtocol: 'HTTP',
        healthCheckPort: 7001,
        healthCheckPath: '/health',
        healthTimeout: 5,
        healthInterval: 10,
        healthyThreshold: 10,
        unhealthyThreshold: 2,
        regionZones: [],
        securityGroups: [],
        listeners: [
          {
            internalProtocol: 'HTTP',
            internalPort: 7001,
            externalProtocol: 'HTTP',
            externalPort: 80
          }
        ]
      };
    }

    return {
      loadLoadBalancers: loadLoadBalancers,
      loadLoadBalancersByApplicationName: loadLoadBalancersByApplicationName,
      normalizeLoadBalancersWithServerGroups: normalizeLoadBalancersWithServerGroups,
      serverGroupIsInLoadBalancer: serverGroupIsInLoadBalancer,
      convertLoadBalancerForEditing: convertLoadBalancerForEditing,
      constructNewLoadBalancerTemplate: constructNewLoadBalancerTemplate,
      getLoadBalancerDetails: getLoadBalancerDetails
    };

  });
