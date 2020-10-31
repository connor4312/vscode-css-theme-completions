module.exports = {
  ignorePatterns: ['**/*.d.ts', '**/*.test.ts', '**/*.js'],
  parser: '@typescript-eslint/parser',
  extends: ['plugin:@typescript-eslint/recommended'],
  parserOptions: {
    ecmaVersion: 2018, // Allows for the parsing of modern ECMAScript features
    sourceType: 'module', // Allows for the use of imports
  },
  rules: {
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
  },
};
