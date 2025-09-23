// lint-staged.config.js
// Lint-staged configuration for pre-commit hooks
module.exports = {
  '*.{ts,tsx,js,jsx}': [
    'eslint --fix',
    'prettier --write',
  ],
  '*.{json,md,yml,yaml}': [
    'prettier --write',
  ],
  '*.{ts,tsx}': [
    'bash -c "npx tsc --noEmit"',
  ],
};
