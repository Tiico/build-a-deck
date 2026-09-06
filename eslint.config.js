import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Prototypes are throwaway by definition (see CLAUDE.md); they are not held to lint.
  { ignores: ['**/dist/**', '**/node_modules/**', '**/prototype/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    },
  },
  {
    // Tests build fixtures whose shape they control; `!` is the honest way to say so.
    files: ['**/test/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
)
