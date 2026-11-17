import { defineConfig } from 'tsup';

/*
 * TWO builds, on purpose (the pml-ui pattern). The root is client components and hooks, marked 'use client' for the
 * Next.js app router. `./public` is the reader-facing blog, rendered by a product's SERVER components, which hand it
 * functions (a Link, a column): a 'use client' module would give them client references instead, and a function
 * cannot cross that line, so `./public` must not carry the mark. It holds no state, so a copy of its helpers inside
 * the root bundle is harmless.
 */
const shared = {
  // CJS too, so a product's jest (CommonJS, node_modules untransformed) can require it.
  format: ['esm', 'cjs'] as ('esm' | 'cjs')[],
  dts: true,
  sourcemap: true,
  // ai-ui (the estate's editor, G5d4c) and TipTap come from the host, once: a second ProseMirror in the page breaks it.
  external: ['react', 'react-dom', /^@shirahcan\/ai-ui/, /^@tiptap\//],
};

export default defineConfig([
  // Every root export is a client component or a hook: mark the bundle for the Next.js app router.
  { ...shared, entry: { index: 'src/index.ts' }, clean: false, banner: { js: "'use client';" } },
  { ...shared, entry: { 'public/index': 'src/public/index.ts' }, clean: false },
]);
