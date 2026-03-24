import babelParser from '@babel/eslint-parser';
import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import eslintJsonc from 'eslint-plugin-jsonc';
import prettier from 'eslint-plugin-prettier';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import * as eslintJsoncParser from 'jsonc-eslint-parser';
import vueParser from 'vue-eslint-parser';

import viteConfig from './vite.config.js';

export default [
  {
    // global ignores
    // folders can only be ignored at the global level, per-cfg you must do:
    // '**/dist/**/*'
    ignores: ['**/dist/', '**/public/', '**/node_modules/'],
  },
  // general defaults
  js.configs.recommended,
  importPlugin.flatConfigs.recommended,
  {
    files: ['**/*.js'],
    rules: {
      'prettier/prettier': [
        'error',
        {},
        {
          usePrettierrc: true,
        },
      ],
      'no-console': 'warn',
      'import/extensions': [
        'warn',
        'always',
        {
          js: 'always',
          json: 'always',
        },
      ],
    },
    plugins: {
      prettier,
      importPlugin,
    },
    settings: {
      'import/resolver': {
        vite: {
          viteConfig,
        },
      },
    },
    languageOptions: {
      parser: babelParser,
      ecmaVersion: 2018,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        requireConfigFile: false,
        allowImportExportEverywhere: true,

        ecmaFeatures: {
          experimentalObjectRestSpread: true,
        },
      },
    },
  },
  {
    files: ['**/*.json'],
    ignores: ['**/package.json', '**/package-lock.json'],
    plugins: {
      jsonc: eslintJsonc,
      prettier,
    },
    languageOptions: {
      parser: eslintJsoncParser,
      parserOptions: {
        jsonSyntax: 'JSON',
      },
    },
    rules: {
      'prettier/prettier': [
        'error',
        {},
        {
          usePrettierrc: true,
        },
      ],
      'no-console': 'warn',
    },
  },
  // ...vue.configs['flat/essential'],
  ...vue.configs['flat/recommended'],
  {
    files: ['*.vue', '**/*.vue'],
    plugins: {
      vue,
      prettier,
      importPlugin,
    },
    settings: {
      'import/resolver': {
        vite: {
          viteConfig,
        },
      },
    },
    languageOptions: {
      parser: vueParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    // processor: vue.processors['.vue'],
    rules: {
      'prettier/prettier': [
        'error',
        {},
        {
          usePrettierrc: true,
        },
      ],
      'no-console': 'warn',
      'import/extensions': [
        'warn',
        'always',
        {
          vue: 'always',
        },
      ],
      // ...vue.configs.base.rules,
      // ...vue.configs.essential.rules,
      // ...vue.configs['strongly-recommended'].rules,
      ...vue.configs.recommended.rules,
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      'vue/first-attribute-linebreak': [
        'warn',
        {
          singleline: 'ignore',
          multiline: 'below',
        },
      ],
      'vue/max-attributes-per-line': 'off',
      'vue/html-indent': [
        'error',
        2,
        {
          attribute: 1,
          baseIndent: 1,
          closeBracket: 0,
          alignAttributesVertically: false,
          ignores: [],
        },
      ],
      'vue/html-self-closing': [
        'error',
        {
          html: {
            void: 'any',
            normal: 'always',
            component: 'always',
          },
          svg: 'always',
          math: 'always',
        },
      ],
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
];
