// Antes del lanzamiento: la home ("/") muestra "Próximamente" y el sitio no se indexa.
// La portada real queda en PORTADA_PREVIA, una dirección que no se enlaza desde ningún lado público.
// El día del lanzamiento: LANZADO = true (y listo: "/" vuelve a ser la portada y se indexa todo).
export const LANZADO = false;
export const PORTADA_PREVIA = '/previa-8stx5ng/';

/** A dónde lleva el logo del encabezado: la portada real, esté donde esté. */
export const INICIO = LANZADO ? '/' : PORTADA_PREVIA;
