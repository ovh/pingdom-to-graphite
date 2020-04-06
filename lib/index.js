const _ = require('lodash');
const Bluebird = require('bluebird');
const Table = require('cli-table3');
const moment = require('moment');
const Joi = require('@hapi/joi');
const Logger = require('./utils/logger');
const Graphite = require('./utils/graphite');
const Api = require('./api');
const Manifest = require('./manifest');

const LIMIT_TS = moment.utc().subtract(2764770, 'seconds').unix();
const NOW = moment.utc().unix();
const ONE_HOUR_AGO = moment.utc().subtract(1, 'hour').unix();
const PINGDOM_CONCURRENCY = 5;

module.exports = class P2G {
  constructor(config) {
    this.config = config;
    this.validateConfig();

    this.logger = new Logger();
    this.api = new Api(this.config);
    this.manifest = new Manifest(this.config);
    this.graphite = new Graphite({
      hostname: this.config.get('graphite.hostname'),
      auth: this.config.get('graphite.auth'),
      prefix: this.config.get('graphite.prefix', 'pingdom'),
    });
  }

  /**
   * Use Joi to validate the input config file.
   */
  validateConfig() {
    const { error } = Joi.object().keys({
      manifest: Joi.string().required(),
      pingdom: Joi.object().keys({
        apiToken: Joi.string().required(),
        appKey: Joi.string().required(), // @todo to remove when Pingdom have migrated its API
        username: Joi.string().email().required(), // @todo to remove when Pingdom have migrated its API
        password: Joi.string().required(), // @todo to remove when Pingdom have migrated its API
        accountEmail: Joi.string().email().required(), // @todo to remove when Pingdom have migrated its API
        regex: Joi.string(),
        tags: Joi.array().items(Joi.string().required()),
      }).required(),
      graphite: Joi.object().keys({
        hostname: Joi.string().hostname().required(),
        auth: Joi.string().regex(/^\w+:[\w.-]+$/).required(),
        prefix: Joi.string(),
      }).required(),
    }).required().validate(this.config.get());

    if (error) {
      throw new Error(error);
    }
  }

  /**
   * List all your available Pingdom checks and TMs.
   */
  async list() {
    const checks = await this.api.getChecks();
    const tms = await this.api.getTms();

    const listTable = new Table({
      head: ['Type', 'ID', 'Name', 'Status'],
    });

    _.forEach(checks, (check) => {
      listTable.push(['check', check.id, check.name, check.status]);
    });

    _.forEach(tms, (tm) => {
      listTable.push(['tm', tm.id, tm.name, tm.status]);
    });

    this.logger.info(`\n${listTable.toString()}\n`);
  }

  /**
   * List all the Pingdom probes.
   */
  async probes() {
    const probes = await this.api.getProbes();

    const listTable = new Table({
      head: ['ID', 'Country iso', 'City'],
    });

    _.forEach(probes, (probe) => {
      listTable.push([probe.id, probe.countryiso, probe.city]);
    });

    this.logger.info(`\n${listTable.toString()}\n`);
  }

  /**
   * Gives you some advice about update frequency.
   */
  async advice() {
    const checks = await this.api.getChecks();
    const tms = await this.api.getTms();

    const totalCount = checks.length + tms.length;
    const callsPerCheck = 2 + totalCount;

    const everyMinutes = 5;
    const dailyCalls = ((60 * 24) / everyMinutes) * callsPerCheck;

    this.logger.info(`You have ${totalCount} monitored checks. Given a 48000/day API limit:`);
    this.logger.info(`Every ${everyMinutes} Minutes: ${dailyCalls}/day - ${dailyCalls < 48000 ? 'WORKS' : "won't work"}`);
  }

  /**
   * Add your checks to your config. (Will overwrite existing list.)
   */
  async init() {
    const manifest = await this.manifest.getContent();
    manifest.checks = manifest.checks || {};
    manifest.tms = manifest.tms || {};

    const checks = await this.api.getChecks();
    const tms = await this.api.getTms();
    const probes = await this.api.getProbes();

    const checksIds = _.map(checks, 'id');
    const tmsIds = _.map(tms, 'id');
    const probesIds = _.map(probes, 'id');

    manifest.checks = _.reduce(checks, (obj, check) => {
      obj[check.id] = manifest.checks[check.id] || {};
      obj[check.id].infos = {
        id: check.id,
        name: check.name,
        hostname: check.hostname,
      };
      return obj;
    }, {});
    manifest.tms = _.reduce(tms, (obj, tm) => {
      obj[tm.id] = manifest.tms[tm.id] || {};
      obj[tm.id].infos = {
        id: tm.id,
        name: tm.name,
        kitchen: tm.kitchen,
      };
      return obj;
    }, {});
    manifest.probes = _.reduce(probes, (obj, probe) => {
      obj[probe.id] = probe;
      return obj;
    }, {});

    await this.manifest.saveManifest({ content: manifest });
    this.logger.info(`The manifest file is updated with ${checksIds.length} checks, ${tmsIds.length} TMs, ${probesIds.length} probes.`);

    return manifest;
  }

  /**
   * Get the status of the Checks and the TMs (up/down) for NOW (only), and push them to Graphite.
   */
  async updateCurrentStatus() {
    this.logger.info('Getting Checks status...');
    const checks = await this.api.getChecks();
    this.logger.info('Getting TMs status...');
    const tms = await this.api.getTms();

    const datas = [];

    // Checks status
    _.forEach(checks, (check) => {
      const check_name = _.snakeCase(check.name);
      const check_status = check.status === 'up' ? 1 : 0;
      const check_lastresponsetime = check.lastresponsetime;
      datas.push({
        path: `checks.${check_name}.status`,
        value: check_status,
        timestamp: NOW,
      });
      datas.push({
        path: `checks.${check_name}.lastresponsetime`,
        value: check_lastresponsetime,
        timestamp: NOW,
      });
    });

    // TMs status
    _.forEach(tms, (tm) => {
      const tm_name = _.snakeCase(tm.name);
      const tm_status = tm.status === 'SUCCESSFUL' ? 1 : 0;
      datas.push({
        path: `tms.${tm_name}.status`,
        value: tm_status,
        timestamp: NOW,
      });
    });

    // Push to Graphite
    await this.graphite.send(datas);
    this.logger.info(`${datas.length} metrics sent to Graphite.`);

    return datas;
  }

  /**
   * Attempt to bring the checks defined in your config file up to date in graphite.
   * If a check has never been polled before it will start with the last 100 checks.
   */
  async update({ summary = false }) {
    let manifest = await this.manifest.getContent();

    // if not already initialized, do it:
    if (_.isEmpty(manifest)) {
      this.logger.info('The manifest file is not yet initialized. Let\'s do it.');
      manifest = await this.init();
    }

    /** Checks * */

    this.logger.info('Getting Checks results...');
    const checks_results = await this.getChecksResults({ manifest, checks: _.map(manifest.checks) });

    this.logger.info('Pushing Checks results to Graphite...');
    await this.pushResults({ manifest, summary, checks_results });

    this.logger.info('Updating Manifest with Checks results...');
    await this.manifest.updateManifest({ manifest, checks_results });

    /** TMs * */

    this.logger.info('Getting TMs results...');
    const tms_results = await this.getTmsResults({ manifest, tms: _.map(manifest.tms) });

    this.logger.info('Pushing TMs results to Graphite...');
    await this.pushResults({ manifest, summary, tms_results });

    this.logger.info('Updating Manifest with TMs results...');
    await this.manifest.updateManifest({ manifest, tms_results });
  }

  /** ------- * */

  // Generic function for getting results from API
  async getResults({
    type, id, latest_ts, earliest_ts,
  }) {
    latest_ts = latest_ts || ONE_HOUR_AGO;
    latest_ts = (latest_ts < LIMIT_TS) ? LIMIT_TS : latest_ts;

    let latest_stored = latest_ts || null;
    let earliest_stored = earliest_ts || null;

    let results = [];
    if (type === 'check_results') {
      results = await this.api.getCheckResults({ id, from: latest_ts });
    } else if (type === 'check_outage') {
      results = await this.api.getCheckSummaryOutage({ id, from: latest_ts });
    } else if (type === 'check_perf') {
      if (latest_ts > ONE_HOUR_AGO) {
        this.logger.warn('Skipping check perf, because the latest_ts is < than one hour ago.');
        results = [];
      } else {
        results = await this.api.getCheckSummaryPerformance({ id, from: latest_ts });
      }
    } else if (type === 'tm_outage') {
      results = await this.api.getTmSummaryOutage({ id, from: latest_ts });
    } else if (type === 'tm_perf') {
      results = await this.api.getTmSummaryPerformance({ id, from: latest_ts });
    }

    // Take only new metrics
    results = _.filter(results, (result) => result._time >= latest_stored || result._time <= earliest_stored);

    // Save latest and earliest results times
    _.forEach(results, (result) => {
      latest_stored = (!latest_stored || result._time >= latest_stored) ? result._time : latest_stored;
      earliest_stored = (!earliest_stored || result._time <= earliest_stored) ? result._time : earliest_stored;
    });

    return {
      latest_ts: latest_stored,
      earliest_ts: earliest_stored,
      results,
    };
  }

  // Get checks results
  async getChecksResults({ manifest, checks }) {
    return await Bluebird.map(checks, async (check) => {
      this.logger.debug(`Check ${check.infos.id}`);

      const check_state = manifest.checks[check.infos.id] || {};

      // Check: detailled results
      const results = await this.getResults({
        type: 'check_results',
        id: check.infos.id,
        latest_ts: check_state.latest_ts,
        earliest_ts: check_state.earliest_ts,
      });

      // Check: outage (uptime)
      const outage_results = await this.getResults({
        type: 'check_outage',
        id: check.infos.id,
        latest_ts: check_state.outage_latest_ts,
        earliest_ts: check_state.outage_earliest_ts,
      });

      // Check: performance
      const perf_results = await this.getResults({
        type: 'check_perf',
        id: check.infos.id,
        latest_ts: check_state.perf_latest_ts,
        earliest_ts: check_state.perf_earliest_ts,
      });

      return {
        id: check.infos.id,
        results,
        outage_results,
        perf_results,
      };
    }, { concurrency: PINGDOM_CONCURRENCY });
  }

  // Get TMs results
  async getTmsResults({ manifest, tms }) {
    return await Bluebird.map(tms, async (tm) => {
      this.logger.debug(`TM ${tm.infos.id}`);

      const tm_state = manifest.tms[tm.infos.id] || {};

      // TM: outage (uptime)
      const outage_results = await this.getResults({
        type: 'tm_outage',
        id: tm.infos.id,
        latest_ts: tm_state.outage_latest_ts,
        earliest_ts: tm_state.outage_earliest_ts,
      });

      // TM: performance
      const perf_results = await this.getResults({
        type: 'tm_perf',
        id: tm.infos.id,
        latest_ts: tm_state.perf_latest_ts,
        earliest_ts: tm_state.perf_earliest_ts,
      });

      return {
        id: tm.infos.id,
        outage_results,
        perf_results,
      };
    }, { concurrency: PINGDOM_CONCURRENCY });
  }

  // Push results to Graphite
  async pushResults({
    manifest, summary = false, checks_results = [], tms_results = [],
  }) {
    const datas = [];

    // Checks
    _.forEach(checks_results, (check) => {
      // Checks results
      if (!summary && check.results && check.results.results && check.results.results.length) {
        _.forEach(check.results.results, (result) => {
          const check_name = _.snakeCase(manifest.checks[check.id].infos.name);
          const check_city = _.snakeCase(manifest.probes[result.probeid].city);
          const check_status = result.status === 'up' ? 1 : 0;
          const check_country = manifest.probes[result.probeid].countryiso;
          datas.push({
            path: `checks.results.${check_name}.status.${check_country}.${check_city}`,
            value: check_status,
            timestamp: result._time,
          });
          datas.push({
            path: `checks.results.${check_name}.responsetime.${check_country}.${check_city}`,
            value: result.responsetime,
            timestamp: result._time,
          });
        });
      }

      // Check: outage
      if (check.outage_results && check.outage_results.results && check.outage_results.results.length) {
        // append the last element (the most recent), to be able to trace a graph
        const lastOutageResult = _.clone(_.maxBy(check.outage_results.results, 'timeto'));
        lastOutageResult._time = lastOutageResult.timeto;
        check.outage_results.results.unshift(lastOutageResult);

        _.forEach(check.outage_results.results, (result) => {
          const check_name = _.snakeCase(manifest.checks[check.id].infos.name);
          const check_status = result.status === 'up' ? 1 : 0;
          datas.push({
            path: `checks.summary.outage.${check_name}.status`,
            value: check_status,
            timestamp: result._time,
          });
        });
      }

      // Check: perf
      if (check.perf_results && check.perf_results.results && check.perf_results.results.length) {
        _.forEach(check.perf_results.results, (result) => {
          const check_name = _.snakeCase(manifest.checks[check.id].infos.name);
          datas.push({
            path: `checks.summary.performance.${check_name}.avgresponse`,
            value: result.avgresponse,
            timestamp: result._time,
          });
        });
      }
    });

    // TMs
    _.forEach(tms_results, (tm) => {
      // TM: outage
      if (tm.outage_results && tm.outage_results.results && tm.outage_results.results.length) {
        // append the last element (the most recent), to be able to trace a graph
        const lastOutageResult = _.clone(_.maxBy(tm.outage_results.results, 'timeto'));
        lastOutageResult._time = lastOutageResult.timeto;
        tm.outage_results.results.unshift(lastOutageResult);

        _.forEach(tm.outage_results.results, (result) => {
          const tm_name = _.snakeCase(manifest.tms[tm.id].infos.name);
          const tm_status = result.status === 'up' ? 1 : 0;
          datas.push({
            path: `tms.summary.outage.${tm_name}.status`,
            value: tm_status,
            timestamp: result._time,
          });
        });
      }

      // TM: perf
      if (tm.perf_results && tm.perf_results.results && tm.perf_results.results.length) {
        _.forEach(tm.perf_results.results, (result) => {
          const tm_name = _.snakeCase(manifest.tms[tm.id].infos.name);
          datas.push({
            path: `tms.summary.performance.${tm_name}.avgresponse`,
            value: result.avgresponse,
            timestamp: result._time,
          });
        });
      }
    });

    // Push to Graphite
    await this.graphite.send(datas);
    this.logger.info(`${datas.length} metrics sent to Graphite.`);

    return datas;
  }
};
