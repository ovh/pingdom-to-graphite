const winston = require('winston');
const chalk = require('chalk');

const environment = process.env.NODE_ENV || 'development';

// Colorise level output
const level = (value) => {
  const uvalue = value.toUpperCase();
  switch (uvalue) {
    case 'SILLY':
    case 'DEBUG':
      return chalk.white(uvalue);
    case 'WARN':
      return chalk.yellow(uvalue);
    case 'ERROR':
      return chalk.red(uvalue);
    default:
      return chalk.blue(uvalue);
  }
};

module.exports = class Logger {
  constructor() {
    const {
      combine, timestamp, printf,
    } = winston.format;

    const myFormat = printf((info) => {
      let { message } = info;
      if (info.level === 'error') {
        if (info.response && info.response.statusCode && info.response.statusMessage) {
          message = `Request fail: ${info.response.statusCode} (${info.response.statusMessage}) ${info.response.method} ${info.response.url}\n`;
          try {
            message += JSON.stringify(info.response.body, null, 2);
          } catch (e) {
            message += info.response.body;
          }
        } else {
          message = info.stack;
        }
      }
      return `${info.timestamp} [${level(info.level)}][${chalk.red(environment.toUpperCase())}] ${message}`;
    });

    // Winston logger
    const logger = winston.createLogger({
      transports: [
        new winston.transports.Console({
          level: process.env.LOG_LEVEL || 'debug',
          handleExceptions: true,
          humanReadableUnhandledException: true,
          json: false,
          colorize: false,
        }),
      ],
      format: combine(
        timestamp(),
        myFormat,
      ),
    });

    return logger;
  }
};
