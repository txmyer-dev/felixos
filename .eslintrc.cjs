module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: {
    es2022: true,
    node: true
  },
  ignorePatterns: ["dist/", "node_modules/", ".turbo/"],
  rules: {
    "@typescript-eslint/consistent-type-imports": "error"
  }
};
