'use strict';

const _ = require('lodash');
const async = require('async');
const chromium = require('chrome-aws-lambda');

class ChromeEngine {
  constructor(script, ee, helpers) {
    this.script = script;
    this.ee = ee;
    this.helpers = helpers;
    this.page = null;

    const launchPage = async function () {
      const browser = await chromium.puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath,
        headless: chromium.headless,
      });

      return await browser.newPage();
    };

    var self = this;
    launchPage().then((page) => {
      self.page = page;
    });
  }

  createScenario(scenarioSpec, ee) {
    var self = this;

    let tasks = _.map(scenarioSpec.flow, function (rs) {
      return self.step(rs, ee);
    });
    return this.compile(tasks, scenarioSpec.flow, ee);
  }

  setInitialContext(initialContext) {
  }

  compile(tasks, _scenarioSpec, ee) {
    let self = this;
    return function (initialContext, callback) {
      initialContext = self.setInitialContext(initialContext);
      let steps = _.flatten([
        function zero(cb) {
          ee.emit('started');
          return cb(null, initialContext);
        },
        tasks,
      ]);
      async.waterfall(steps, function scenarioWaterfallCb(err, context) {
        if (err) {
          return callback(err, context);
        }
        else {
          return callback(null, context);
        }
      });
    };
  }

  step(requestSpec, ee, opts) {
    opts = opts || {};
    var self = this;
    const config = this.script.config;

    const f = function (context, callback) {
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

        await self.page.goto(uri);

        const endedAt = process.hrtime(startedAt);
        let duration = (endedAt[0] * 1e9) + endedAt[1];
        ee.emit('counter', 'engine.chrome.responses', 1);
        ee.emit('histogram', 'engine.chrome.response_time', duration / 1e6); // ms
        return callback(null, context);
      })().catch((err) => {
        ee.emit('error', err.message);
        return callback(err, context);
      });
    };
    return f;
  }
}

module.exports = ChromeEngine;