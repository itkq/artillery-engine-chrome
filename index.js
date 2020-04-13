'use strict';

const _ = require('lodash');
const debug = require('debug')('chrome');
const async = require('async');
const chromium = require('chrome-aws-lambda');

function ChromeEngine(script, ee, helpers) {
  this.script = script;
  this.ee = ee;
  this.helpers = helpers;

  return this;
}

ChromeEngine.prototype.createScenario = function(scenarioSpec, ee) {
  var self = this;

  const launchPage = async function () {
    const browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    return await browser.newPage();
  };

  launchPage().then((page) => {
    self.page = page;
  });

  let tasks = _.map(scenarioSpec.flow, function (rs) {
    return self.step(rs, ee);
  });
  return this.compile(tasks, scenarioSpec.flow, ee);
}

ChromeEngine.prototype.compile = function(tasks, _scenarioSpec, ee) {
  return function scenario(initialContext, callback) {
    let steps = _.flatten([
      function zero(cb) {
        ee.emit('started');
        return cb(null, initialContext);
      },
      tasks,
    ]);
    async.waterfall(steps, function done(err, context) {
      if (err) {
        return callback(err, context);
      }
      else {
        return callback(null, context);
      }
    });
  };
}

ChromeEngine.prototype.step = function(requestSpec, ee, opts) {
  opts = opts || {};
  var self = this;
  const config = this.script.config;

  const f = function (context, callback) {
    const method = _.keys(requestSpec)[0].toUpperCase();
    let params = requestSpec[method.toLowerCase()];
    let err = null;
    if (!params.url) {
      err = new Error('an URL must be specified');
      ee.emit('error', err.message);
      return callback(err, context);
    }
    const opts = {
      timeout: 1000, // 1000ms
      waitUntil: 'domcontentloaded',
    };
    const uri = config.target + params.url;

    (async () => {
      // FIXME: browser should be loaded before scenario starts
      if (typeof self.page === 'undefined') {
        err = new Error('browser not loaded yet')
        ee.emit('error', err);
        return callback(err, context);
      }

      const startedAt = process.hrtime();
      ee.emit('request');
      debug('goto start')
      const response = await self.page.goto(uri, opts);
      debug('goto end');
      const endedAt = process.hrtime(startedAt);
      const statusCode = response.status();
      const delta = (endedAt[0] * 1e9) + endedAt[1];
      ee.emit('response', delta, statusCode, context._uid);
      return callback(null, context);
    })().catch((err) => {
      ee.emit('error', err.message);
      return callback(err, context);
    });
  };

  return f;
}

module.exports = ChromeEngine;
