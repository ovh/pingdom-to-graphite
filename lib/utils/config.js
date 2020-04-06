const _ = require('lodash');
const path = require('path');
const { readFile } = require('./files');

module.exports = class Config {
  constructor(config = {}) {
    this.config = config;
  }

  async load(configPath) {
    this.config = await readFile(path.resolve(process.cwd(), configPath));
  }

  defaults(obj) {
    return _.defaultsDeep(this.config, obj);
  }

  get(key, defaultValue) {
    if (key) {
      return _.get(this.config, key, defaultValue);
    }
    return this.config;
  }

  set(key, value) {
    return _.set(this.config, key, value);
  }
};
