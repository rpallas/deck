'use strict';

const angular = require('angular');
import _ from 'lodash';

import { ACCOUNT_SERVICE } from '@spinnaker/core';

module.exports = angular
  .module('spinnaker.openstack.region.regionSelectField.directive', [
    ACCOUNT_SERVICE,
    require('../common/selectField.component.js').name,
  ])
  .directive('osRegionSelectField', function(accountService) {
    return {
      restrict: 'E',
      templateUrl: require('../common/cacheBackedSelectField.template.html'),
      scope: {
        label: '@',
        labelColumnSize: '@',
        helpKey: '@',
        model: '=',
        filter: '=',
        account: '<',
        onChange: '&',
        readOnly: '<',
        allowNoSelection: '=',
        noOptionsMessage: '@',
        noSelectionMessage: '@',
      },
      link: function(scope) {
        _.defaults(scope, {
          label: 'Region',
          labelColumnSize: 3,
          valueColumnSize: 7,
          options: [{ label: scope.model, value: scope.model }],
          filter: {},
          backingCache: 'regions',
          updateOptions: function() {
            return accountService.getRegionsForAccount(scope.account).then(function(regions) {
              scope.options = _.chain(regions)
                .map(r => ({ label: r, value: r }))
                .sortBy('label')
                .value();
              return scope.options;
            });
          },
          onValueChanged: function(newValue) {
            scope.model = newValue;
            if (scope.onChange) {
              scope.onChange({ region: newValue });
            }
          },
        });

        scope.$watch('account', function() {
          scope.$broadcast('updateOptions');
        });
      },
    };
  });
