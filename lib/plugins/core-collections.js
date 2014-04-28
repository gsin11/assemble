

/**
 * Assemble <http://assemble.io>
 *
 * Copyright (c) 2014 Jon Schlinkert, Brian Woodward, contributors
 * Licensed under the MIT License (MIT).
 */

'use strict';

// Node.js
var path = require('path');

// node_modules
var collections = require('assemble-collections');
var async = require('async');
var _ = require('lodash');

module.exports = function(assemble) {

  var events = assemble.config.plugins.events;

  var configureCollections = function (params, done) {
    assemble.log.debug('\t[core plugin]: ', 'core-collections-config plugin', params.event);
    assemble.log.debug('\t[params]:', params);

    assemble.options.collections = assemble.options.collections || [];
    collections.cache = [];

    // generate a collection object for each collection in the assemble.options
    for (var i = 0; i < assemble.options.collections.length; i++) {
      collections.createCollection(assemble.options.collections[i]);
    }

    assemble.collections = collections.cache;

    done();
  };

  configureCollections.options = {
    name: 'core-collections-configure',
    description: 'Configure collections.',
    events: [
      events.assembleAfterConfiguration
    ]
  };

  var buildCollectionPages = function (params, done) {
    assemble.log.debug('\t[core plugin]: ', 'core-collections-pages plugin', params.event);
    assemble.log.debug('\t[params]:', params);

    if (!assemble.options.collections) {
      return done();
    }

    async.series([
      // add the pages to the proper collections
      function (nextStep) {
        async.eachSeries(_.keys(assemble.pages),
          function (key, next) {
            collections.addItemToCollection(assemble.pages[key]);
            next();
          },
        nextStep);
      },

      // build a index pages for the collections
      function (nextStep) {
        async.eachSeries(assemble.options.collections, function (collectionOpts, next) {
          if (!collectionOpts.index) {
            return next();
          }

          var collection = collections.cache[collectionOpts.plural];
          var opts = collectionOpts.index || {};
          opts.pagination = opts.pagination || {};

          // sort the collection items
          var collectionItems = collection.sort(opts.pagination.sort || opts.pagination.sortby);
          var totalCollectionItems = collectionItems.length;
          var collectionItemsPerPage = opts.pagination.limit || totalCollectionItems;
          var totalPages = Math.ceil(totalCollectionItems / collectionItemsPerPage);

          var pageIndexes = [];
          for (var i = 0; i < totalPages; i++) {
            pageIndexes.push(i);
          }

          async.eachSeries(pageIndexes, function (idx, nextPage) {
            if(!opts.template || opts.template.length === 0) {
              return nextPage();
            }
            // load in the template
            var indexTemplate = assemble.utils.component.fromFile(opts.template, 'component');

            var context = {};
            var startIdx = idx * collectionItemsPerPage;
            var endIdx = startIdx + collectionItemsPerPage;
            context[collectionOpts.plural] = collectionItems.slice(startIdx, endIdx);

            // add additional data to the template
            indexTemplate.data[collectionOpts.plural] = context[collectionOpts.plural];
            indexTemplate.data.dest = indexTemplate.dest = path.join(
              (opts.dest || '.'),
              collectionOpts.plural,
              ''+(idx+1),
              'index.html');

            // add this indexTemplate to the pages list to be rendered
            assemble.pages['collections-' + collectionOpts.plural + '-' + (idx+1)] = indexTemplate;
            nextPage();
          },
          next);
        },
        nextStep);
      },

      // build related-pages pages for collection items
      function (nextStep) {
        async.eachSeries(assemble.options.collections, function (collectionOpts, next) {
          if (!collectionOpts['related_pages']) {
            return next();
          }

          var collection = collections.cache[collectionOpts.plural];
          var opts = collectionOpts['related_pages'] || {};
          opts.pagination = opts.pagination || {};

          async.eachSeries(collection.collectionItems.toArray(), function (collectionItem, nextCollectionItem) {

            var key = collectionItem.collectionItem;
            var items = collectionItem.items.sorted(opts.pagination.sort || opts.pagination.sortby);
            var totalItems = items.length;
            var itemsPerPage = opts.pagination.limit || totalItems;
            var totalPages = Math.ceil(totalItems / itemsPerPage);

            var pageIndexes = [];
            for (var i = 0; i < totalPages; i++) {
              pageIndexes.push(i);
            }

            async.eachSeries(pageIndexes, function (idx, nextPage) {
              if(!opts.template || opts.template.length === 0) {
                return nextPage();
              }
              var relatedTemplate = assemble.utils.component.fromFile(opts.template, 'component');

              var context = {};
              var startIdx = idx * itemsPerPage;
              var endIdx = startIdx + itemsPerPage;
              context['related-pages'] = items.slice(startIdx, endIdx);

              relatedTemplate.data['related-pages'] = context['related-pages'];
              relatedTemplate.data.dest = relatedTemplate.dest = path.join(
                (opts.dest || '.'),
                collectionOpts.plural,
                key,
                ''+(idx+1),
                'index.html');

              assemble.pages['collections-' + collectionOpts.plural + '-' + key + '-' + (idx+1)] = relatedTemplate;
              nextPage();
            },
            nextCollectionItem);
          },
          next);
        },
        nextStep);
      }
    ],
    done);

  };

  buildCollectionPages.options = {
    name: 'core-collections-pages',
    description: 'Build collection pages.',
    events: [
      events.assembleAfterBuild  // after building the pages
    ]
  };

  var normalizeCollections = function (params, done) {
    if (!assemble.options.collections || assemble.options.collections.length === 0) {
      return done();
    }

    async.eachSeries(assemble.options.collections, function (collectionOpts, next) {

      var collection = collections.cache[collectionOpts.plural];
      var opts = collectionOpts['related_pages'] || {};
      opts.pagination = opts.pagination || {};

      // add this collection to the params context
      params.context.collections = params.context.collections || {};
      params.context.collections[collectionOpts.plural] = [];

      async.eachSeries(collection.collectionItems.toArray(), function (collectionItem, nextCollectionItem) {

        var key = collectionItem.collectionItem;
        var items = collectionItem.items.sorted(opts.pagination.sort || opts.pagination.sortby);

        var newItem = {};
        newItem[collectionOpts.name] = key;
        newItem.pages = [];

        async.eachSeries(items, function (item, nextItem) {
          newItem.pages.push(item);
          nextItem();
        },
        function () {
          params.context.collections[collectionOpts.plural].push(newItem);
          nextCollectionItem();
        });
      },
      next);
    },
    done);

  };

  normalizeCollections.options = {
    name: 'core-collections-normalize',
    description: 'Normalize the collections for the current page context.',
    events: [
      events.pageBeforeRender // just before rendering the page
    ]
  };

  var rtn = {};
  rtn[configureCollections.options.name] = configureCollections;
  rtn[buildCollectionPages.options.name] = buildCollectionPages;
  rtn[normalizeCollections.options.name] = normalizeCollections;
  return rtn;
};