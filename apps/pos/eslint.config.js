const baseConfig = require("@zenzoo/config/eslint.config.js");

module.exports = [
  ...baseConfig,
  {
    ignores: [".expo/**"],
  },
];
