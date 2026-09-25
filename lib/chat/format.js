// Ruta: lib/chat/format.js
// Formato de texto del chat (sin HTML, seguro):
//   *negrita*   _cursiva_   ++subrayado++   ~tachado~   `código`
// y los enlaces http(s) se vuelven clicables.

import { Fragment, createElement as h } from 'react';

const RULES = [
  { re: /`([^`\n]+)`/, render: (t, k) => h('code', { key: k, style: { fontFamily: 'monospace', background: 'rgba(0,0,0,0.12)', padding: '0 4px', borderRadius: 4 } }, t) },
  { re: /\*([^*\n]+)\*/, render: (t, k, r) => h('strong', { key: k }, r(t)) },
  { re: /\+\+([^+\n]+)\+\+/, render: (t, k, r) => h('u', { key: k }, r(t)) },
  { re: /(?<![\w])_([^_\n]+)_(?![\w])/, render: (t, k, r) => h('em', { key: k }, r(t)) },
  { re: /~([^~\n]+)~/, render: (t, k, r) => h('s', { key: k }, r(t)) },
  {
    re: /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/,
    render: (t, k) => h('a', { key: k, href: t, target: '_blank', rel: 'noopener noreferrer', style: { color: 'inherit', textDecoration: 'underline' } }, t),
  },
];

let keySeq = 0;

export function renderFormatted(text) {
  if (!text) return null;
  const run = (s) => {
    const out = [];
    let rest = s;
    while (rest) {
      let best = null;
      for (const rule of RULES) {
        const m = rule.re.exec(rest);
        if (m && (!best || m.index < best.m.index)) best = { m, rule };
      }
      if (!best) {
        out.push(rest);
        break;
      }
      if (best.m.index > 0) out.push(rest.slice(0, best.m.index));
      out.push(best.rule.render(best.m[1], `f${keySeq++}`, run));
      rest = rest.slice(best.m.index + best.m[0].length);
    }
    return out;
  };
  return h(Fragment, null, ...run(text));
}

// Envuelve la selección del textarea con un marcador
export function wrapSelection(textarea, value, marker, setValue) {
  const [open, close] = Array.isArray(marker) ? marker : [marker, marker];
  const start = textarea?.selectionStart ?? value.length;
  const end = textarea?.selectionEnd ?? value.length;
  const selected = value.slice(start, end) || 'texto';
  const next = value.slice(0, start) + open + selected + close + value.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(start + open.length, start + open.length + selected.length);
  });
}

// Emojis por categoría (sin librerías externas)
export const EMOJI_GROUPS = [
  {
    label: 'Caras',
    icon: '😀',
    list: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖'.split(' '),
  },
  {
    label: 'Gestos',
    icon: '👍',
    list: '👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🙏 🤝 👏 🙌 👐 🤲 💪 ✍️ 🫶 👀 🧠 🫡 🤷 🤦 🙋 🙆 🙅 💁 🙇'.split(' '),
  },
  {
    label: 'Corazones',
    icon: '❤️',
    list: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ⚡ 🎉 🎊 🎈 🎁 🏆 🥇 🎯'.split(' '),
  },
  {
    label: 'Trabajo',
    icon: '💼',
    list: '💼 📁 📂 📄 📃 📑 📊 📈 📉 🗂️ 📅 📆 🗓️ 📌 📍 📎 🖇️ ✏️ 🖊️ 📝 ✅ ☑️ ❌ ⚠️ ❗ ❓ 💡 🔔 📣 📢 📞 ☎️ 📱 💻 🖥️ ⌨️ 🖨️ 📧 📨 📩 💰 💵 💳 🧾 🏦 🏢 🏠 ⏰ ⏳ 🔒 🔑'.split(' '),
  },
  {
    label: 'Varios',
    icon: '☕',
    list: '☕ 🍕 🍔 🌮 🍟 🍩 🍪 🎂 🍰 🍺 🍻 🥂 🍷 🥤 🍎 🍌 🍓 🥑 🌞 🌙 ☀️ 🌧️ ⛈️ ❄️ 🌈 🌴 🌺 🌻 🐶 🐱 🐭 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🦄 🚗 ✈️ 🚀 ⚽ 🏀 🎮 🎵 🎶 🇨🇴 🇺🇸 🇻🇪 🇲🇽'.split(' '),
  },
];

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];