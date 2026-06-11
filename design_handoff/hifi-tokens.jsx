// Plantry design tokens. Verbatim port target for app/web/src/index.css CSS variables.
// Direction: warm cream surfaces, terracotta accent, serif dish names, sans UI.

const PT = {
  color: {
    bg: '#F7F2E9',          // app background, warm cream
    surface: '#FFFDF9',     // cards and sheets
    ink: '#2C241B',         // primary text
    sub: '#94846F',         // secondary text
    line: '#E9E0D2',        // hairlines and borders
    accent: '#BC5430',      // terracotta, primary actions
    accentSoft: '#F4E4DB',  // selected and highlighted fills
    green: '#5F7355',       // meal labels, positive states
    greenSoft: '#EDEFE4',   // soft green fill
    danger: '#A33B25',      // destructive actions
    dangerLine: '#D8B7AC',  // destructive borders
    scrim: 'rgba(44,36,27,0.45)',
    onAccent: '#FFF8F2',
  },
  font: {
    serif: "'Source Serif 4', Georgia, serif",   // dish names, headings, numerals
    sans: "'Source Sans 3', 'Helvetica Neue', sans-serif", // everything else
  },
  size: {
    title: 26, screenTitle: 22, dishName: 16.5, body: 14.5, meta: 12.5, micro: 11,
  },
  radius: { card: 18, control: 14, chip: 12, pill: 999, thumb: 10 },
  space: (n) => n * 4,
};

// Global stylesheet: CSS variables plus base resets shared by every surface.
(function injectTokens() {
  const s = document.createElement('style');
  s.textContent = `
    :root {
      --pt-bg: ${PT.color.bg};
      --pt-surface: ${PT.color.surface};
      --pt-ink: ${PT.color.ink};
      --pt-sub: ${PT.color.sub};
      --pt-line: ${PT.color.line};
      --pt-accent: ${PT.color.accent};
      --pt-accent-soft: ${PT.color.accentSoft};
      --pt-green: ${PT.color.green};
      --pt-green-soft: ${PT.color.greenSoft};
      --pt-danger: ${PT.color.danger};
      --pt-font-serif: ${PT.font.serif};
      --pt-font-sans: ${PT.font.sans};
    }
    html, body { margin: 0; padding: 0; background: #3D362C; }
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    button { font: inherit; border: none; background: none; padding: 0; cursor: pointer; color: inherit; text-align: inherit; }
    input { font: inherit; }
    ::-webkit-scrollbar { display: none; }
  `;
  document.head.appendChild(s);
})();

window.PT = PT;
