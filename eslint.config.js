import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Base JavaScript rules
  js.configs.recommended,
  
  // TypeScript rules
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  
  {
    // Global configuration
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'writable',
      },
    },
    
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-inferrable-types': 'warn',
      
      // General code quality rules
      'no-console': 'off', // We use console for CLI output
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      
      // Code style rules
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      
      // Error prevention
      'no-unreachable': 'error',
      'no-unreachable-loop': 'error',
      'no-constant-condition': 'error',
      'no-duplicate-case': 'error',
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-ex-assign': 'error',
      'no-extra-boolean-cast': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-invalid-regexp': 'error',
      'no-irregular-whitespace': 'error',
      'no-loss-of-precision': 'error',
      'no-misleading-character-class': 'error',
      'no-prototype-builtins': 'error',
      'no-regex-spaces': 'error',
      'no-setter-return': 'error',
      'no-sparse-arrays': 'error',
      'no-unexpected-multiline': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      
      // Best practices
      'array-callback-return': 'error',
      'block-scoped-var': 'error',
      'consistent-return': 'warn',
      'curly': ['warn', 'multi-line'],
      'default-case': 'warn',
      'dot-notation': 'error',
      'eqeqeq': ['error', 'always'],
      'guard-for-in': 'error',
      'no-case-declarations': 'warn',
      'no-constructor-return': 'error',
      'no-else-return': 'warn',
      'no-empty-function': 'warn',
      'no-empty-pattern': 'error',
      'no-fallthrough': 'error',
      'no-floating-decimal': 'error',
      'no-global-assign': 'error',
      'no-implicit-coercion': 'warn',
      'no-implicit-globals': 'error',
      'no-lone-blocks': 'error',
      'no-loop-func': 'error',
      'no-multi-spaces': 'warn',
      'no-new': 'error',
      'no-new-wrappers': 'error',
      'no-octal': 'error',
      'no-octal-escape': 'error',
      'no-param-reassign': 'warn',
      'no-redeclare': 'error',
      'no-return-assign': 'error',
      'no-return-await': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unused-expressions': 'error',
      'no-useless-call': 'error',
      'no-useless-catch': 'error',
      'no-useless-concat': 'error',
      'no-useless-escape': 'error',
      'no-useless-return': 'error',
      'no-void': 'error',
      'no-with': 'error',
      'prefer-promise-reject-errors': 'error',
      'radix': 'error',
      'require-await': 'warn',
      'vars-on-top': 'warn',
      'wrap-iife': 'error',
      'yoda': 'error',
    },
  },
  
  {
    // Test files configuration
    files: ['**/*.test.ts', '**/*.test.js', '**/tests/**/*'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
      },
    },
    rules: {
      // Relax many rules for test files
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty-function': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'vars-on-top': 'off',
      'require-await': 'off',
      'no-multi-spaces': 'off',
      'no-implicit-coercion': 'off',
      'default-case': 'off',
      'no-case-declarations': 'off',
      'consistent-return': 'off',
    },
  },
  
  {
    // CommonJS files (like jest.config.cjs)
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        exports: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },

  {
    // Ignore patterns
    ignores: [
      'dist/**/*',
      'node_modules/**/*',
      'coverage/**/*',
      '*.config.js',
      '*.config.ts',
    ],
  }
);
