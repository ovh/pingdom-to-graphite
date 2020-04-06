#!/usr/bin/env node

const program = require('commander');
const Logger = require('../lib/utils/logger');
const Config = require('../lib/utils/config');
const P2G = require('../lib');

const logger = new Logger();

// Load config
async function getConfig(configurationFile) {
  const config = new Config();
  try {
    await config.load(configurationFile);
  } catch (e) {
    logger.error(e);
    process.exit(1);
  }
  return config;
}

// Main function
(async () => {
  program
    .command('list')
    .requiredOption('--config <config>', 'The location of your config file.')
    .description('List all your available Pingdom checks and TMs')
    .action(async (cmd) => {
      try {
        const config = await getConfig(cmd.config);
        const p2g = new P2G(config);
        await p2g.list();
      } catch (e) {
        logger.error(e);
        process.exit(1);
      }
    });

  program
    .command('probes')
    .requiredOption('--config <config>', 'The location of your config file.')
    .description('List all the Pingdom probes')
    .action(async (cmd) => {
      try {
        const config = await getConfig(cmd.config);
        const p2g = new P2G(config);
        await p2g.probes();
      } catch (e) {
        logger.error(e);
        process.exit(1);
      }
    });

  program
    .command('advice')
    .requiredOption('--config <config>', 'The location of your config file.')
    .description('Gives you some advice about your quota')
    .action(async (cmd) => {
      try {
        const config = await getConfig(cmd.config);
        const p2g = new P2G(config);
        await p2g.advice();
      } catch (e) {
        logger.error(e);
        process.exit(1);
      }
    });

  program
    .command('init')
    .requiredOption('--config <config>', 'The location of your config file.')
    .description('Add your checks to your manifest file.')
    .action(async (cmd) => {
      try {
        const config = await getConfig(cmd.config);
        const p2g = new P2G(config);
        await p2g.init();
      } catch (e) {
        logger.error(e);
        process.exit(1);
      }
    });

  program
    .command('update')
    .requiredOption('--config <config>', 'The location of your config file.')
    .option('--summary', 'Send only a summary (no probes stats).')
    .description('Get the status of the Checks and the TMs (up/down) since the last update, and push them to Graphite.')
    .action(async (cmd) => {
      try {
        const config = await getConfig(cmd.config);
        const p2g = new P2G(config);
        await p2g.update({ summary: !!cmd.summary });
      } catch (e) {
        logger.error(e);
        process.exit(1);
      }
    });

  program
    .command('updateCurrentStatus')
    .requiredOption('--config <config>', 'The location of your config file.')
    .description('Get the status of the Checks and the TMs (up/down) for NOW (only), and push them to Graphite.')
    .action(async (cmd) => {
      try {
        const config = await getConfig(cmd.config);
        const p2g = new P2G(config);
        await p2g.updateCurrentStatus();
      } catch (e) {
        logger.error(e);
        process.exit(1);
      }
    });

  program.parse(process.argv);
})();
