import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  // Prototypes are throwaway by definition (see CLAUDE.md); they are not held to lint.
  // `.stack` är E2E-svitens bygge av appen, lagt bredvid paketet och ignorerat av git — samma
  // slags artefakt som `dist`, och lika lite källkod. Utan den här raden faller `pnpm lint` för
  // var och en som kört E2E-sviten före den, på minifierad kod ingen skrivit.
  { ignores: ['**/dist/**', '**/.stack/**', '**/node_modules/**', '**/prototype/**', '**/prototyper/**', '.claude/worktrees/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      // Leaving fields out by destructuring the rest is how a record becomes the document it
      // wraps; the names left behind are the point, not an oversight. This is the base rule's
      // own default, which the TypeScript rule does not carry over.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    // The rules of hooks (#562): a hook after an early return is called only on the renders that
    // get past it, which #534 shipped and only React's own warning caught. React Compiler's newer
    // rules in the plugin's `recommended` are a question of their own and are not taken here.
    files: ['packages/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
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
