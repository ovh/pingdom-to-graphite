const _ = require('lodash');
const path = require('path');
const { readFile, writeFile } = require('../utils/files');

module.exports = class Manifest {
  constructor(config) {
    this.config = config;
    this.manifestFileLocation = path.resolve(process.cwd(), this.config.get('manifest', 'manifest.json'));
  }

  async load() {
    let content = {};
    try {
      content = await readFile(this.manifestFileLocation);
    } catch (e) {
      content = {}; // because file can be empty, so don't fail
    }
    this.content = content;
    return this.content;
  }

  get(key, defaultValue) {
    if (key) {
      return _.get(this.content, key, defaultValue);
    }
    return this.content;
  }

  async saveManifest({ content }) {
    await writeFile(this.manifestFileLocation, content);
    this.content = content;
  }

  async updateManifest({ checks_results = [], tms_results = [] }) {
    _.forEach(checks_results, (checkResult) => {
      this.content.checks[checkResult.id].latest_ts = checkResult.results.latest_ts;
      this.content.checks[checkResult.id].earliest_ts = checkResult.results.earliest_ts;
      this.content.checks[checkResult.id].outage_latest_ts = checkResult.outage_results.latest_ts;
      this.content.checks[checkResult.id].outage_earliest_ts = checkResult.outage_results.earliest_ts;
      this.content.checks[checkResult.id].perf_latest_ts = checkResult.perf_results.latest_ts;
      this.content.checks[checkResult.id].perf_earliest_ts = checkResult.perf_results.earliest_ts;
    });
    _.forEach(tms_results, (tmResult) => {
      this.content.tms[tmResult.id].outage_latest_ts = tmResult.outage_results.latest_ts;
      this.content.tms[tmResult.id].outage_earliest_ts = tmResult.outage_results.earliest_ts;
      this.content.tms[tmResult.id].perf_latest_ts = tmResult.perf_results.latest_ts;
      this.content.tms[tmResult.id].perf_earliest_ts = tmResult.perf_results.earliest_ts;
    });
    await this.saveManifest({ content: this.content });
  }
};
