const Bluebird = require('bluebird');
const _ = require('lodash');
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
      hooks: {
        beforeRetry: [(options, error, retryCount) => {
          const txnHeader = _.get(error, 'response.headers["x-app-txn"]');
          this.logger.warn(`[Graphite] Attempt ${retryCount} failed: ${error.name}${error.response ? `${error.response.statusCode} ${error.response.statusMessage}${txnHeader ? `(x-app-txn: ${txnHeader})` : ''}` : ''}. Retrying...`);
        }],
      },
    });
  }

  async send(datas) {
    if (!Array.isArray(datas)) {
      datas = [datas];
    }

    const displayProgressBar = (this.logger.levels[this.logger.level] < 4);
    let progressBar;

    if (displayProgressBar) {
      progressBar = new cliProgress.SingleBar({
        format: 'Graphite update | {bar} | {percentage}% || {value}/{total} metrics',
        noTTYOutput: !process.stdout.isTTY,
      }, cliProgress.Presets.shades_classic);
      progressBar.start(datas.length, 0);
    }

    await Bluebird.map(datas, async (data) => {
      const line = `${this.prefix ? (`${this.prefix}.`) : ''}${data.path} ${data.value} ${data.timestamp}`;

      try {
        const result = await this.api.post({
          url: this.apiUrl,
          body: line,
        });
        this.logger.debug(`✓ Pushed to Graphite: "${line}"`);
        if (displayProgressBar) {
          progressBar.increment();
        }
        return result.body;
      } catch (e) {
        if (displayProgressBar) {
          progressBar.stop();
        }
        this.logger.error(`✗ Failed to push to Graphite: "${line}"`);
        throw e;
      }
    }, { concurrency: this.concurrency });

    if (displayProgressBar) {
      progressBar.stop();
    }
  }
};
