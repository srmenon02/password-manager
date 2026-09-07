import tseslintPlugin from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  ...tseslintPlugin.configs['flat/recommended'],
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      ...reactHooks.configs.flat['recommended-latest'].plugins,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat['recommended-latest'].rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
]
