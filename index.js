const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

/**
 * 递归创建目录结构并写入文件（不会清空已有目录）
 * @param {string} basePath 基础路径
 * @param {Object} structure 目录结构对象
 */
async function createDirectoryStructure(basePath, structure) {
  try {
    // 👇 只有在目录不存在时才创建
    if (!fs.existsSync(basePath)) {
      await fs.mkdirp(basePath);
      console.log(chalk.cyan(`📁 创建目录：${basePath}`));
    } else {
      console.log(chalk.yellow(`📂 目录已存在，正在更新内容：${basePath}`));
    }

    for (const [key, value] of Object.entries(structure)) {
      const fullPath = path.join(basePath, key);

      if (typeof value === 'function') {
        try {
          let { path: templatePath, config } = value();
          const data = await fs.readFile(templatePath, 'utf8');
          const nameRegex = /#name/g;
          const contentRegex = /#content/g;
          let newStr = data.replace(nameRegex, config.name).replace(contentRegex, config.content);

          await fs.outputFile(fullPath, newStr);
          console.log(chalk.green(`✅ 文件已写入：${fullPath}`));
        } catch (err) {
          console.error(chalk.red(`❌ 创建失败：${fullPath}`), err);
        }
      } else if (typeof value === 'string') {
        await fs.outputFile(fullPath, value);
        console.log(chalk.green(`✅ 文件已写入：${fullPath}`));
      } else {
        // 递归处理子目录
        await createDirectoryStructure(fullPath, value);
      }
    }
  } catch (err) {
    console.error(chalk.red(`❌ 操作失败：${basePath}`), err);
  }
}

function t(config, templatePath) {
  return function () {
    return {
      path: templatePath,
      config,
      type: 'page'
    };
  };
}

function f(config, templatePath) {
  return t(config, templatePath);
}

module.exports = function (baseDir = './dist') {
  return {
    t,
    f,
    init: function (config) {
      return async () => {
        try {
          await createDirectoryStructure(baseDir, config);
          console.log(chalk.green('✅ 构建成功了，棒小伙！'));
        } catch (err) {
          console.error(chalk.red(`❌ 构建失败：${err.message}`));
        }
      };
    }
  };
};