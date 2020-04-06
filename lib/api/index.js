const _ = require('lodash');
const PingdomApi = require('./pingdom-api');

module.exports = class Api {
  constructor(config) {
    this.config = config;
    this.pingdom = new PingdomApi(this.config);
    this.pingdomLegacy = new PingdomApi(this.config, true); // @TODO to remove when Pingdom have migrated its API

    this.filterTags = this.config.get('pingdom.tags');
    this.filterRegex = new RegExp(this.config.get('pingdom.regex') || '^.*$');
  }

  /**
   * Get probes list.
   * https://docs.pingdom.com/api/#tag/Probes/paths/~1probes/get
   */
  async getProbes() {
    const response = await this.pingdom.get('probes');
    return response.body.probes;
  }

  /**
   * Get checks (ping) list.
   * https://docs.pingdom.com/api/#tag/Checks/paths/~1checks/get
   */
  async getChecks() {
    const response = await this.pingdom.get('checks', {
      tags: this.filterTags ? this.filterTags.join(',') : '',
      showencryption: true,
      include_tags: true,
      include_severity: true,
    });
    let data = response.body.checks || [];
    // filter the checks regargind the Regex from config:
    data = _.filter(data, (d) => this.filterRegex.test(d.name));
    return data;
  }

  /**
   * Get Transaction Monitoring list.
   * (not documented)
   */
  async getTms() {
    const response = await this.pingdomLegacy.get('tms.recipes', {
      tags: this.filterTags ? this.filterTags.join(',') : '',
    });
    // transform it to an array like the checks:
    let data = _.map(_.keys(response.body.recipes), (id) => {
      response.body.recipes[id].id = parseInt(id, 10);
      return response.body.recipes[id];
    });
    // filter the checks regargind the Regex from config:
    data = _.filter(data, (d) => this.filterRegex.test(d.name));
    return data;
  }

  /**
   * Get raw checks results.
   * https://docs.pingdom.com/api/#tag/Results/paths/~1results~1{checkid}/get
   */
  async getCheckResults({
    id, from, limit = 1000, offset = 0,
  }) {
    const response = await this.pingdom.get(`results/${id}`, {
      from,
      limit,
      offset,
    });
    const results = _.get(response.body, 'results', []);
    return _.map(results, (result) => {
      result._time = result.time;
      return result;
    });
  }

  /**
   * Get Check summary outage results.
   * https://docs.pingdom.com/api/#tag/Summary.outage/paths/~1summary.outage~1{checkid}/get
   */
  async getCheckSummaryOutage({
    id, from,
  }) {
    const response = await this.pingdom.get(`summary.outage/${id}`, {
      from,
    });
    const results = _.get(response.body, 'summary.states', []);
    return _.map(results, (result) => {
      result._time = result.timefrom;
      return result;
    });
  }

  /**
   * Get Check summary performance results.
   * https://docs.pingdom.com/api/#tag/Summary.performance/paths/~1summary.performance~1{checkid}/get
   */
  async getCheckSummaryPerformance({
    id, from,
  }) {
    const response = await this.pingdom.get(`summary.performance/${id}`, {
      from,
    });
    const results = _.get(response.body, 'summary.hours', []);
    return _.map(results, (result) => {
      result._time = result.starttime;
      return result;
    });
  }

  /**
   * Get TM summary outage results.
   * (not documented)
   */
  async getTmSummaryOutage({
    id, from,
  }) {
    const response = await this.pingdomLegacy.get(`tms.summary.outage/${id}`, {
      from,
    });
    const results = _.get(response.body, 'summary.states', []);
    return _.map(results, (result) => {
      result._time = result.timefrom;
      return result;
    });
  }

  /**
   * Get TM summary performance results.
   * (not documented)
   */
  async getTmSummaryPerformance({
    id, from,
  }) {
    const response = await this.pingdomLegacy.get(`tms.summary.performance/${id}`, {
      from,
    });
    const results = _.get(response.body, 'summary.hours', []);
    return _.map(results, (result) => {
      result._time = result.starttime;
      return result;
    });
  }

  /**
   * @TODO: quota
   * [NOT USED]
   */
  // eslint-disable-next-line class-methods-use-this
  async getQuota({ headers }) {
    const long = headers['req-limit.long'];
    const short = headers['req-limit.short'];

    const LIMIT_REGEX = /^Remaining: (\d+) Time until reset: (\d+)$/i;

    const longInfos = long.match(LIMIT_REGEX);
    const shortInfos = short.match(LIMIT_REGEX);

    return {
      long: {
        remaining: longInfos.length ? longInfos[1] : 0,
        resets_at: longInfos.length ? longInfos[2] : 0,
      },
      short: {
        remaining: shortInfos.length ? shortInfos[1] : 0,
        resets_at: shortInfos.length ? shortInfos[2] : 0,
      },
    };
  }
};
