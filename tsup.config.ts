import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // CJS too, so a product's jest (CommonJS, node_modules untransformed) can require it.
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // ai-ui (the estate's editor, G5d4c) and TipTap come from the host, once: a second ProseMirror in the page breaks it.
  external: ['react', 'react-dom', /^@shirahcan\/ai-ui/, /^@tiptap\//],
  // Every export is a client component or a hook: mark the bundle for the Next.js app router.
  banner: { js: "'use client';" },
});
