#!/usr/bin/env node

const program = require('commander');
const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');
const chalk = require('chalk');
const fse = require('fs-extra');


// 假设你的项目根目录是 process.cwd()
const rootDir = process.cwd();
// 引入核心逻辑
const app = require('./index.js');

program.version('1.0.0');



// 👇 内置模板映射表
const templateMap = {
  v2: path.resolve(__dirname, './templates/v2.vue'),
  v3: path.resolve(__dirname, './templates/v3.vue'),
  v3s: path.resolve(__dirname, './templates/v3s.vue')
};

// generate module 子命令
// 默认中文描述生成函数
function defaultContent(moduleName, fileName) {
  const mapping = {
    index: `${moduleName}列表页`,
    edit: `编辑${moduleName}`,
    detail: `${moduleName}详情页`,
    create: `新增${moduleName}`
  };
  return mapping[fileName] || `${moduleName}页面`;
}

program
  .command('module')
  .description('生成模块，支持不同文件选择不同模板 + 输入不同中文内容')
  .requiredOption('-n, --name <moduleName>', '模块名称（英文），多个用逗号分隔')
  .option('--files <fileNames>', '要生成的文件名列表，逗号分隔，默认: index', 'index')
  .option('-o, --output <dir>', '输出目录，默认为 ./dist') // 👈 新增这一行
  .action(async (options) => {
    const { name, files, output } = options;

    // 如果没有指定 output，默认是 ./dist
    const baseDir = output ? path.resolve(output) : path.resolve('./dist'); // ✅ 改动点

    const nameList = name.split(',').map(n => n.trim()).filter(Boolean);
    const fileList = files.split(',').map(f => f.trim()).filter(Boolean);

    const allAnswers = {}; // 存储每个模块每个文件的配置

    for (const moduleName of nameList) {
      const answersForModule = {};
      for (const fileName of fileList) {
        const answerTemplate = await inquirer.prompt([
          {
            type: 'list',
            name: 'templateType',
            message: `请选择【${moduleName}/${fileName}.vue】使用的模板类型`,
            choices: [
              { name: 'Vue2 默认模板', value: 'v2' },
              { name: 'Vue3 Composition API 模板', value: 'v3' },
              { name: 'Vue3 <script setup> 模板', value: 'v3s' },
              { name: '自定义模板路径', value: 'custom' }
            ]
          },
          {
            type: 'input',
            name: 'customTemplatePath',
            message: `请输入【${moduleName}/${fileName}.vue】的自定义模板路径`,
            when: (ans) => ans.templateType === 'custom'
          }
        ]);

        let selectedTemplatePath;
        if (answerTemplate.templateType === 'custom') {
          selectedTemplatePath = path.resolve(answerTemplate.customTemplatePath);
          if (!fs.existsSync(selectedTemplatePath)) {
            console.error(chalk.red(`❌ 自定义模板路径不存在：${selectedTemplatePath}`));
            return;
          }
        } else {
          selectedTemplatePath = templateMap[answerTemplate.templateType];
        }

        const answerContent = await inquirer.prompt([
          {
            type: 'input',
            name: 'content',
            message: `请输入【${moduleName}/${fileName}.vue】的中文描述`,
            default: defaultContent(moduleName, fileName)
          }
        ]);

        answersForModule[fileName] = {
          templatePath: selectedTemplatePath,
          content: answerContent.content
        };
      }
      allAnswers[moduleName] = answersForModule;
    }

    const { init, t } = app(baseDir); // ✅ baseDir 已支持自定义目录

    const modules = nameList.reduce((acc, moduleName) => {
      acc[moduleName] = {};
      fileList.forEach(fileName => {
        const fileData = allAnswers[moduleName][fileName];
        acc[moduleName][`${fileName}.vue`] = t(
          { name: moduleName, content: fileData.content },
          fileData.templatePath
        );
      });
      return acc;
    }, {});

    init(modules)();

    console.log(chalk.green(`✅ 模块创建成功：${nameList.join(', ')}`));
    console.log(chalk.cyan(`📝 已生成文件：${fileList.map(f => `${f}.vue`).join(', ')}`));
    console.log(chalk.yellow(`📁 输出目录：${baseDir}`)); // 👈 可选：加个提示信息
  });

// generate --config 子命令
program
  .command('generate')
  .description('根据配置文件生成模块结构（支持 .js/.json）')
  .requiredOption('-c, --config <path>', '配置文件路径（支持 .js 或 .json）')
  .option('-o, --output <dir>', '输出目录，默认为 ./dist')
  .action(async (options) => {
    const baseDir = options.output ? path.resolve(options.output) : './dist';
    const configPath = path.resolve(options.config);

    let config;

    try {
      const ext = path.extname(configPath).toLowerCase();

      if (ext === '.js') {
        config = require(configPath);
      } else if (ext === '.json') {
        const data = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(data);
      } else {
        throw new Error('不支持的配置文件格式，请使用 .js 或 .json');
      }
      const { init, t } = app(baseDir);
      const structure = buildStructureFromConfig(config, t);
      init(structure)();
    } catch (e) {
      console.error(chalk.red(`❌ 配置加载或生成失败：${e.message}`));
    }
  });

// 构建结构映射函数
function buildStructureFromConfig(config, t) {
  function walk(node, parentDir = '', pathStack = []) {
    const result = {};

    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        // 当前节点路径栈
        const currentPathStack = [...pathStack, key];

        if ('field' in value && 'template' in value) {
          const { field, template } = value;

          let templatePath;

          if (templateMap[template]) {
            templatePath = templateMap[template];
          } else if (template && template.startsWith('/')) {
            const relativePath = template.slice(1);
            templatePath = path.resolve(rootDir, relativePath);
          } else if (template) {
            templatePath = path.resolve(parentDir, template);
          } else {
            throw new Error(`模板字段缺失或为空，请检查配置项：${key}`);
          }

          if (!fs.existsSync(templatePath)) {
            throw new Error(`模板文件不存在：${templatePath}`);
          }

          // 👇 构造 name：文件夹名 + 文件名（驼峰格式）
          const pascalCaseName = pathStack
            .concat(key.replace(/\.vue$/, ''))  // 去掉 .vue 后缀
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('');

          // 👇 构造相对路径字符串：如 policeCarInfo/comp/a
          const relativePath = pathStack.join('/') + '/' + key.replace(/\.vue$/, '');

          // 👇 把 name 和 fullPath 传入模板配置
          result[key] = t({
            pageName: pascalCaseName,
            pagePath: relativePath,
            ...field
          }, templatePath);

        } else {
          // 是目录节点，继续递归
          const currentPath = path.resolve(parentDir, key);
          result[key] = walk(value, currentPath, currentPathStack);
        }
      }
    }

    return result;
  }

  return walk(config, process.cwd(), []);
}

// 解析命令行参数
program.parse(process.argv);