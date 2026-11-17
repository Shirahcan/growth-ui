import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
copyFileSync('src/styles.css', 'dist/styles.css');
// The public blog's own sheet (./public.css), so a reader-facing page never loads the admin screens' CSS.
copyFileSync('src/public/blog.css', 'dist/public.css');
