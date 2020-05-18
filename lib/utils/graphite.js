const Bluebird = require('bluebird');
const got = require('got');
const cliProgress = require('cli-progress');
const Logger = require('./logger');
const pkg = require('../../package.json');

module.exports = class Graphite {
  constructor({
    hostname,
    auth,
    prefix,
    concurrency = 5,
  }) {
    this.logger = new Logger();
    this.prefix = prefix;
    this.concurrency = concurrency;

    this.apiUrl = `https://${auth}@${hostname}/api/v1/sink`; // because "prefixUrl" add a trailing slash
    this.api = got.extend({
      headers: {
        'User-Agent': `Node/${pkg.name} ${pkg.version} (${pkg.repository.url})`,
      },
      timeout: 30000,
      retry: {
        limit: 5,
        methods: [
          'GET',
          'PUT',
          'POST',
          'DELETE',
        ],
        statusCodes: [
          408,
          413,
          422,
          429,
          500,
          502,
          503,
          504,
        ],
      },
    });
  }

  async send(datas) {
    if (!Array.isArray(datas)) {
      datas = [datas];
    }
    const progressBar = new cliProgress.SingleBar({
      format: 'Graphite update | {bar} | {percentage}% || {value}/{total} metrics',
      noTTYOutput: !process.stdout.isTTY,
    }, cliProgress.Presets.shades_classic);
    progressBar.start(datas.length, 0);
    await Bluebird.map(datas, async (data) => {
      const line = `${this.prefix ? (`${this.prefix}.`) : ''}${data.path} ${data.value} ${data.timestamp}`;
      const result = await this.api.post({
        url: this.apiUrl,
        body: line,
      });
      progressBar.increment();
      return result.body;
    }, { concurrency: this.concurrency });
    progressBar.stop();
  }
};
