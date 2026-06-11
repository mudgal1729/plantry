// Plantry shareable images. A separate surface from the PWA: calm, label free,
// legible at phone size on WhatsApp. Rendered at 360 wide here; exported at 3x.
const SH = window.PT;

function ShareFrame({ children, pad }) {
  return (
    <div style={{ width: '100%', maxWidth: 360, background: '#FBF6ED', fontFamily: SH.font.sans, color: SH.color.ink, padding: pad || '26px 24px 20px' }}>
      {children}
      <div style={{ textAlign: 'center', marginTop: 18, fontFamily: SH.font.serif, fontSize: 12, color: '#B5A78F', letterSpacing: '0.06em' }}>Plantry</div>
    </div>
  );
}

function ShareHeading({ title, sub }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 16 }}>
      <div style={{ fontFamily: SH.font.serif, fontSize: 21, fontWeight: 700 }}>{title}</div>
      {sub && <div style={{ fontSize: 12.5, color: SH.color.sub, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// Image 1: the week's menu. One card per day, date badge left, meals right.
function MenuShareImage({ week }) {
  const D = window.PlantryData.DISHES;
  const nameOf = (e) => (e.key ? D[e.key].name : e.custom);
  return (
    <ShareFrame>
      <ShareHeading title="This week" sub="June 15 to 20" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {week.map((day) => (
          <div key={day.id} style={{ background: '#FFFEFA', border: '1px solid #EBE2D2', borderRadius: 12, padding: '10px 12px', display: 'flex', gap: 12 }}>
            <div style={{ width: 38, flexShrink: 0, textAlign: 'center', borderRight: '1px solid #EBE2D2', paddingRight: 10 }}>
              <div style={{ fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: SH.color.sub }}>{day.short}</div>
              <div style={{ fontFamily: SH.font.serif, fontSize: 20, fontWeight: 600, lineHeight: 1.15 }}>{day.date}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.5 }}>
              {day.skipped ? (
                <div style={{ color: SH.color.sub }}>Skipped</div>
              ) : (
                <React.Fragment>
                  {day.breakfast.length > 0 && (
                    <div><span style={{ color: SH.color.green, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Breakfast&nbsp;&nbsp;</span>{day.breakfast.map(nameOf).join(', ')}</div>
                  )}
                  <div><span style={{ color: SH.color.green, fontWeight: 700, fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Lunch&nbsp;&nbsp;</span>{day.lunch.map(nameOf).join(', ')}</div>
                </React.Fragment>
              )}
            </div>
          </div>
        ))}
      </div>
    </ShareFrame>
  );
}

// Image 2: the grocery list, fixed group order.
function GroceryShareImage() {
  const G = window.PlantryData.GROCERY;
  return (
    <ShareFrame>
      <ShareHeading title="Groceries" sub="June 15 to 20" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {G.map((g) => (
          <div key={g.group}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: SH.color.green, fontWeight: 700, borderBottom: '1px solid #EBE2D2', paddingBottom: 4, marginBottom: 6 }}>{g.group}</div>
            <div style={{ columnCount: 2, columnGap: 18, fontSize: 12.5, lineHeight: 1.7 }}>
              {g.items.map((it) => <div key={it} style={{ breakInside: 'avoid' }}>{it}</div>)}
            </div>
          </div>
        ))}
      </div>
    </ShareFrame>
  );
}

// Image 3+: one recipe sheet per dish marked "include recipe when sharing".
function RecipeShareImage({ dishKey }) {
  const d = window.PlantryData.DISHES[dishKey];
  return (
    <ShareFrame>
      <ShareHeading title={d.name} sub={`About ${d.time} minutes · serves 2`} />
      <div style={{ background: '#FFFEFA', border: '1px solid #EBE2D2', borderRadius: 12, padding: '12px 14px', fontSize: 12.5, lineHeight: 1.55 }}>
        <div><span style={{ color: SH.color.sub }}>Equipment:</span> {d.cook.equipment}</div>
        <div><span style={{ color: SH.color.sub }}>Buy specially:</span> {d.cook.special}</div>
      </div>
      <div style={{ marginTop: 12 }}>
        {d.cook.recipe.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>
            <span style={{ fontFamily: SH.font.serif, color: SH.color.accent, fontWeight: 700, fontSize: 15 }}>{i + 1}</span>
            <span>{s}</span>
          </div>
        ))}
      </div>
    </ShareFrame>
  );
}

Object.assign(window, { MenuShareImage, GroceryShareImage, RecipeShareImage });
