import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/', 'out/', 'assets/', 'docs/'],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ['src/scenes/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message:
            'Frame reproducibility: do not read wall-clock time in scenes. Pass a fixed timestamp or derive time from the Revideo timeline.',
        },
        {
          object: 'Math',
          property: 'random',
          message:
            'Frame reproducibility: do not use unseeded randomness in scenes. Use a deterministic seeded value derived from the plan or frame.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'Frame reproducibility: do not construct Date without a fixed value in scenes. Pass a fixed timestamp or derive time from the Revideo timeline.',
        },
      ],
    },
  },
);
