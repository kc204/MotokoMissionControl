module.exports = {
  extends: ["next", "turbo", "prettier"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
  }
};
