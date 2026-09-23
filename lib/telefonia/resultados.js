// Fuente única de verdad para los 6 resultados comerciales de una
// llamada (punto 29 del doc). Usado por components/telefonia/callInProgress.js
// y app/llamadas/page.js — antes estaba duplicado en llamadas/page.js.

export const RESULTADO_LABEL = {
  no_contesto: 'No contestó',
  contactado: 'Contactado',
  interesado: 'Interesado',
  seguimiento: 'Seguimiento',
  no_interesado: 'No interesado',
  numero_incorrecto: 'Número incorrecto',
};

// Reutiliza los mismos tríos de color (texto/fondo/borde) definidos en
// globals.css para los embudos de Leads.
export const RESULTADO_STYLE = {
  interesado: 'custom',
  contactado: 'protected',
  seguimiento: 'default',
  no_contesto: 'none',
  no_interesado: 'none',
  numero_incorrecto: 'error',
};

export function pillStyle(variant) {
  return {
    background: `var(--color-status-${variant}-bg)`,
    color: `var(--color-status-${variant}-text)`,
    borderColor: `var(--color-status-${variant}-border)`,
  };
}