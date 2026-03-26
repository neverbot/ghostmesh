import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import eslintJsonc from 'eslint-plugin-jsonc';
import prettier from 'eslint-plugin-prettier';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import * as eslintJsoncParser from 'jsonc-eslint-parser';
import vueParser from 'vue-eslint-parser';

export default [
  {
    ignores: ['**/dist/', '**/public/', '**/node_modules/', 'vite.config.ts', 'eslint.config.js'],
  },
  js.configs.recommended,
  importPlugin.flatConfigs.recommended,
  {
    files: ['eslint.config.js'],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    plugins: {
      prettier,
      importPlugin,
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
    rules: {
      'prettier/prettier': ['error', {}, { usePrettierrc: true }],
      'no-console': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'import/extensions': ['warn', 'always', { ts: 'always', json: 'always' }],
      'import/no-unresolved': 'off',
      'import/namespace': 'off',
      'import/default': 'off',
      'import/named': 'off',
      'import/no-named-as-default-member': 'off',
    },
  },
  {
    files: ['**/*.js'],
    plugins: {
      prettier,
      importPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'prettier/prettier': ['error', {}, { usePrettierrc: true }],
      'no-console': 'warn',
      'import/extensions': ['warn', 'always', { js: 'always', json: 'always' }],
      'import/no-unresolved': 'off',
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
      'prettier/prettier': ['error', {}, { usePrettierrc: true }],
      'no-console': 'warn',
    },
  },
  ...vue.configs['flat/recommended'],
  {
    files: ['*.vue', '**/*.vue'],
    plugins: {
      vue,
      prettier,
      importPlugin,
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: vueParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        parser: tsParser,
      },
    },
    rules: {
      'prettier/prettier': ['error', {}, { usePrettierrc: true }],
      'no-console': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'import/extensions': ['warn', 'always', { vue: 'always', ts: 'always' }],
      'import/no-unresolved': 'off',
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
