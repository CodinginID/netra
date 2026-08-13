import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  {
    // Build output, deps, and the separate VitePress docs site (own toolchain).
    ignores: ['dist', 'dev-dist', 'node_modules', 'docs-site', 'public'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Applies to every linted file, .cjs scripts included: an underscore prefix
    // is the intentional "unused on purpose" marker; anything else is a finding.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Node-side scripts and config files run outside the browser.
    files: ['*.config.{js,ts}', 'scripts/**/*.{js,ts,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Build scripts are genuine CommonJS — require() is correct there.
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  }
)
