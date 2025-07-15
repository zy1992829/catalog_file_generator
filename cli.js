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
  const result = {};

  function walk(node, parentDir = '') {
    const obj = {};
    for (const [key, value] of Object.entries(node)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if ('content' in value && 'template' in value) {
          // 是文件节点
          const { content, template } = value;

          let templatePath;
         // 判断是否是内置模板
         if (templateMap[template]) {
          templatePath = templateMap[template];
        }
        // 判断是否是以 / 开头的“绝对路径”（相对于项目根目录）
        else if (template.startsWith('/')) {
          const relativePath = template.slice(1); // 去掉开头的 /
          templatePath = path.resolve(rootDir, relativePath);
          if (!fs.existsSync(templatePath)) {
            throw new Error(`自定义模板不存在：${templatePath}`);
          }
        }
        // 否则当作相对路径处理（相对于当前模块目录）
        else {
          templatePath = path.resolve(parentDir, template);
          if (!fs.existsSync(templatePath)) {
            throw new Error(`找不到模板文件：${templatePath}`);
          }
        }

          // 构建文件名（去掉 .vue 后缀用于 name 变量）
          const name = key.replace(/\.vue$/, '');

          obj[key] = t({ name, content }, templatePath);
        } else {
          // 是目录节点，递归处理
          const currentPath = path.resolve(parentDir, key);
          obj[key] = walk(value, currentPath);
        }
      }
    }
    return obj;
  }

  return walk(config, process.cwd());
}

// 解析命令行参数
program.parse(process.argv);