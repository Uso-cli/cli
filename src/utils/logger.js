const chalk = require('chalk');
const ora = require('ora');

const log = {
    info: (msg) => console.log(chalk.blue(msg)),
    success: (msg) => console.log(chalk.green(msg)),
    warn: (msg) => console.log(chalk.yellow(msg)),
    error: (msg) => console.log(chalk.red(msg)),
    header: (msg) => console.log(chalk.bold.cyan(msg)),
    subHeader: (msg) => console.log(chalk.cyan(msg)),
};

const spinner = (text) => ora(text);

module.exports = { log, spinner };
