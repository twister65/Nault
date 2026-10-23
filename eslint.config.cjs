/*
 * ESLint 10 flat config for the Angular 22 migration branch.
 * Preserve the existing Angular lint policy; do not introduce unrelated
 * TypeScript/core presets or change the Ledger/RPC runtime.
 */
const tsParser = require('@typescript-eslint/parser');
const angular = require('angular-eslint');
const recommendedRules = configs => Object.assign({}, ...configs.map(config => config.rules));
const angularTs = require('@angular-eslint/eslint-plugin');
const angularTemplate = require('@angular-eslint/eslint-plugin-template');
const templateParser = require('@angular-eslint/template-parser');

module.exports = [
  {
    ignores: [
      'projects/**/*',
      'dist/**/*',
      'desktop-app/dist/**/*',
      'desktop-app/build/**/*',
    ],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json', './e2e/tsconfig.e2e.json'],
        sourceType: 'module',
      },
    },
    plugins: {
      '@angular-eslint': angularTs,
      '@angular-eslint/template': angularTemplate,
    },
    processor: angularTemplate.processors['extract-inline-html'],
    rules: {
      ...recommendedRules(angular.configs.tsRecommended),
      '@angular-eslint/component-selector': [
        'error',
        { prefix: 'app', style: 'kebab-case', type: 'element' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { prefix: 'app', style: 'camelCase', type: 'attribute' },
      ],
      '@angular-eslint/no-empty-lifecycle-method': 'off',
      '@angular-eslint/prefer-standalone': 'off',
      '@angular-eslint/prefer-inject': 'off',
      // Keep the existing change detection behavior during the framework migration.
      '@angular-eslint/prefer-on-push-component-change-detection': 'off',
    },
  },
  {
    files: ['**/*.html'],
    languageOptions: { parser: templateParser },
    plugins: { '@angular-eslint/template': angularTemplate },
    rules: {
      ...recommendedRules(angular.configs.templateRecommended),
      '@angular-eslint/template/eqeqeq': 'off',
      '@angular-eslint/template/prefer-control-flow': 'off',
    },
  },
];
