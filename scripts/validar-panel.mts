// Abre cada entrada con el lector de Keystatic (el mismo esquema que usa el panel).
// Si alguna no valida, el panel no la podría abrir: sale con error para que no se suba.
// Uso: npm run validar-panel
import { createReader } from '@keystatic/core/reader';
import config from '../keystatic.config.ts';

const reader = createReader(process.cwd(), { ...config, storage: { kind: 'local' } });
let errores = 0;
for (const coleccion of Object.keys(config.collections ?? {}) as (keyof typeof reader.collections)[]) {
  const slugs = await reader.collections[coleccion].list();
  for (const slug of slugs) {
    try {
      await reader.collections[coleccion].read(slug);
    } catch (err) {
      errores++;
      console.error(`❌ ${String(coleccion)}/${slug}: ${(err as Error).message.split('\n')[0]}`);
    }
  }
  console.log(`${String(coleccion)}: ${slugs.length} entradas`);
}
if (errores) {
  console.error(`${errores} entradas no se pueden abrir en el panel.`);
  process.exit(1);
}
