/**
 * Assemble <http://assemble.io>
 *
 * Copyright (c) 2014 Jon Schlinkert, Brian Woodward, contributors
 * Licensed under the MIT License (MIT).
 */

'use strict';

// node_modules
var file = require('fs-utils');
var async = require('async');
var _ = require('lodash');

// Local libs
var notifier = require('./notifier');
var config = require('../config');
var registerPartials = require('./partials');
var registerComponents = require('./components');
var registerPages = require('./pages');

var events = config.plugins.events;

var normalizePages = function (assemble) {
  var results = [];
  var pages = assemble.options.pages || [];

  var addPage = function (filepath) {
    var pageComponent = assemble.utils.component.fromFile(filepath, 'component');
    results.push(pageComponent);
  };

  for(var i = 0; i < pages.length; i++) {
    var page = pages[i];
    if (_.isString(page) || _.isArray(page)) {
      var expanded = file.expand(page);
      expanded.forEach(addPage);
    } else {
      if (_.isObject(page) && !(page instanceof assemble.models.Component)) {
        var pageComponent = new assemble.models.Component(page);
        results.push(pageComponent);
      } else if (_.isObject(page)) {
        results.push(page);
      }
    }
  }

  return results;
};

module.exports = function(assemble, done) {
  assemble.log.debug('\t[build]:', 'initializing');

  // setup parameters to pass to plugins
  var params = {};

  // setup a notifier to notify plugins
  var notify = notifier(assemble, params);

  // provide plugins with the list of pages
  // so they can be modified if needed
  params.pages = (assemble.options.files || []).concat(normalizePages(assemble));

  // run steps in series so we can notify plugins
  // before and after the build steps are done
  async.series([

    // notify plugins before the build
    notify(events.assembleBeforeBuild),

    /**
     * register partials with the current engine
     *
     * @param   {Function} nextStep
     * @return  {Function} callback
     */

    function (nextStep) {
      assemble.log.debug('\t[build]:', 'registering partials');
      registerPartials(assemble, nextStep);
    },

    /**
     * register components with the current engine
     */
    function (nextStep) {
      assemble.log.debug('\t[build]:', 'registering components');
      registerComponents(assemble, nextStep);
    },

    /**
     * register pages
     *
     * @param   {Function} nextStep
     * @return  {Function} callback
     */

    function (nextStep) {
      assemble.log.debug('\t[build]:', 'registering pages');
      registerPages(assemble, params, nextStep);
    },

    // notify plugins after the build
    notify(events.assembleAfterBuild)
  ],
  done);
};