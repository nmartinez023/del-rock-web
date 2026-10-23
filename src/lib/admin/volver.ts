// A dónde volver después de iniciar sesión con GitHub: solo páginas del panel /admin.
export const COOKIE_VOLVER = 'delrock-volver';

export const destinoValido = (valor: string | null | undefined): string | undefined =>
  valor && /^\/admin(\/[a-z-]+)?\/?$/.test(valor) ? valor : undefined;
