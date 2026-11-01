/** Utilidades de dados brasileiros usadas no checkout (navegador) e no servidor. */

export const onlyDigits = (v: string): string => v.replace(/\D/g, "");

/** CPF válido: 11 dígitos, não repetidos e com dígitos verificadores corretos. */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/** Celular/fixo com DDD (10 ou 11 dígitos), rejeitando sequências repetidas como 99999…/00000…. */
export function isValidPhone(value: string): boolean {
  const d = onlyDigits(value).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length < 10 || d.length > 11) return false;
  if (/^(\d)\1+$/.test(d) || /(\d)\1{6,}/.test(d.slice(2))) return false;
  return Number(d.slice(0, 2)) >= 11;
}

/** Telefone no formato da Fruitfy/Utmify: só dígitos com 55 na frente. */
export function phoneE164(value: string): string {
  const d = onlyDigits(value);
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

export const maskCpf = (v: string): string =>
  onlyDigits(v)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

export const maskPhone = (v: string): string => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};

export const maskCep = (v: string): string =>
  onlyDigits(v)
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, "$1-$2");
