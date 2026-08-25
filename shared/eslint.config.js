import tseslintPlugin from '@typescript-eslint/eslint-plugin'

export default [
  { ignores: ['node_modules/**', 'src/**/*.js', 'src/**/*.d.ts'] },
  ...tseslintPlugin.configs['flat/recommended'],
]
