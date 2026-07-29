// eslint.config.js  (ESLint 9/10 flat config — ES module / React)
// Run:  npm run lint
// Fix:  npm run lint:fix

import js           from '@eslint/js';
import globals      from 'globals';
import reactHooks   from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  // ── Ignore generated / vendor files ─────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-*/**',
      'public/**',
    ],
  },

  // ── Base recommended rules ───────────────────────────────────────────────────
  js.configs.recommended,

  // ── React + hooks ────────────────────────────────────────────────────────────
  {
    files: ['**/*.{js,jsx}'],
    plugins: {
      'react-hooks':   reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType:  'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // ── React Hooks safety ──────────────────────────────────────────────────
      ...reactHooks.configs.recommended.rules,

      // ── Hot-reload safety ───────────────────────────────────────────────────
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // ── Operator precedence ─────────────────────────────────────────────────
      'no-mixed-operators': ['error', {
        groups: [
          ['??', '||'], ['??', '&&'],
          ['&&', '||'],
        ],
        allowSamePrecedence: true,
      }],

      // ── Import hygiene ───────────────────────────────────────────────────────
      'no-unused-vars': ['warn', {
        vars: 'all', args: 'after-used', ignoreRestSiblings: true,
        varsIgnorePattern: '^_',
      }],

      // ── Code quality ─────────────────────────────────────────────────────────
      'no-undef':              'error',
      'no-unreachable':        'error',
      'no-dupe-keys':          'error',
      'no-duplicate-case':     'error',
      'no-useless-escape':     'error',
      'no-constant-condition': 'warn',
      'no-empty':              ['warn', { allowEmptyCatch: true }],

      // ── Async safety ─────────────────────────────────────────────────────────
      'no-async-promise-executor': 'error',

      // ── Console (warn — keep error/warn, clean up log) ───────────────────────
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
