'use strict';

const _ = require('lodash');
const CDP = require('chrome-remote-interface');

function ChromeEngine(script, ee, helpers) {
  this.script = script;
  this.ee = ee;
  this.helpers = helpers;

  (async () => {
    let client;
    try {
      this.client = await CDP({ host: '127.0.0.1' });
      let { Network, Page } = this.client;

      Promise.all([Network.enable(), Page.enable()]);
    } catch (err) {
      if (typeof client !== 'undefined') {
        client.close();
      }
      throw err;
    }
  })();

  return this;
}

ChromeEngine.prototype.createScenario = function(scenarioSpec, ee) {
  var self = this;

  let tasks = _.map(scenarioSpec.flow, function(rs) {
    return self.step(rs, ee);
  });

  return this.compile(tasks, scenarioSpec.flow, ee);
}

ChromeEngine.prototype.setInitialContext = function(initialContext) {
}

ChromeEngine.prototype.compile = function(tasks, _scenarioSpec, ee) {
  let self = this;

  return function(initialContext, callback) {
    initialContext = self.setInitialContext(initialContext);
    let steps = _.flatten([
      function zero(cb) {
        ee.emit('started');
        return cb(null, initialContext);
      },
      tasks,
    ]);

    async.waterfall(
      steps,
      function scenarioWaterfallCb(err, context) {
        if (err) {
          return callback(err, context);
        } else {
          return callback(null, context);
        }
      }
    )
  };
}

ChromeEngine.prototype.step = function(requestSpec, ee, opts) {
  opts = opts || {};
  let self = this;
  const config = this.script.config;
  const page = this.client.Page;

  const f = function(context, callback) {
    const method = _.keys(requestSpec)[0].toUpperCase();
    let params = requestSpec[method.toLowerCase()];

    if (!params.url) {
      const err = new Error('an URL must be specified');
      ee.emit('error', err.message);
      return callback(err, context);
    }

    const uri = config.target + params.url;

    (async () => {
      ee.emit('counter', 'engine.chrome.requests', 1);
      const startedAt = process.hrtime();

      const timeout = async function(ms) {
        return new Promise((_, reject) => {
          setTimeout(() => {
            reject(Error('Timeout'));
          }, ms);
        })
      }

      const asyncNavigateAndLoad = async function() {
        await page.navigate({ url: uri });
        await page.loadEventFired();
      }

      await Promise.race([timeout(1000), asyncNavigateAndLoad()]).catch((err) => {
        ee.emit('counter', 'engine.chrome.responses', 1);
        throw err;
      });

      const endedAt = process.hrtime(startedAt);
      let duration = (endedAt[0] * 1e9) + endedAt[1];

      ee.emit('counter', 'engine.chrome.responses', 1);
      ee.emit('histogram', 'engine.chrome.response_time', duration / 1e6); // ms

      return callback(null, context);
    })().catch((err) => {
      ee.emit('error', err.message);
      return callback(err, context);
    });
  }

  return f;
}

module.exports = ChromeEngine;