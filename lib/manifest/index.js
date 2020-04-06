const _ = require('lodash');
const path = require('path');
const { readFile, writeFile } = require('../utils/files');

module.exports = class Manifest {
  constructor(config) {
    this.config = config;
    this.manifestFileLocation = path.resolve(process.cwd(), this.config.get('manifest', 'manifest.json'));
  }

  async getContent() {
    let content = {};
    try {
      content = await readFile(this.manifestFileLocation);
    } catch (e) {
      content = {}; // because file can be empty, so don't fail
    }
    return content;
  }

  async saveManifest({ content }) {
    await writeFile(this.manifestFileLocation, content);
  }

  async updateManifest({ manifest, checks_results = [], tms_results = [] }) {
    _.forEach(checks_results, (checkResult) => {
      manifest.checks[checkResult.id].latest_ts = checkResult.results.latest_ts;
      manifest.checks[checkResult.id].earliest_ts = checkResult.results.earliest_ts;
      manifest.checks[checkResult.id].outage_latest_ts = checkResult.outage_results.latest_ts;
      manifest.checks[checkResult.id].outage_earliest_ts = checkResult.outage_results.earliest_ts;
      manifest.checks[checkResult.id].perf_latest_ts = checkResult.perf_results.latest_ts;
      manifest.checks[checkResult.id].perf_earliest_ts = checkResult.perf_results.earliest_ts;
    });
    _.forEach(tms_results, (tmResult) => {
      manifest.tms[tmResult.id].outage_latest_ts = tmResult.outage_results.latest_ts;
      manifest.tms[tmResult.id].outage_earliest_ts = tmResult.outage_results.earliest_ts;
      manifest.tms[tmResult.id].perf_latest_ts = tmResult.perf_results.latest_ts;
      manifest.tms[tmResult.id].perf_earliest_ts = tmResult.perf_results.earliest_ts;
    });
    await this.saveManifest({ content: manifest });
  }
};
