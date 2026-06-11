// Plantry composed screens. Overlays (sheets, dialogs) live in hifi-overlays.jsx.
const { useState } = React;
const ST = window.PT;

function ScreenShell({ children }) {
  return <div style={{ height: '100%', background: ST.color.bg, display: 'flex', flexDirection: 'column', fontFamily: ST.font.sans, color: ST.color.ink, position: 'relative', overflow: 'hidden' }}>{children}</div>;
}

// ---------- Passcode gate ----------
function GateScreen({ onUnlock }) {
  const [code, setCode] = useState('');
  const press = (k) => {
    setCode((prev) => {
      if (k === 'del') return prev.slice(0, -1);
      if (prev.length >= 4) return prev;
      const next = prev + k;
      if (next.length === 4) setTimeout(() => onUnlock(), 250);
      return next;
    });
  };
  return (
    <ScreenShell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: ST.font.serif, fontSize: 30, fontWeight: 700 }}>Plantry</div>
          <div style={{ fontSize: 14, color: ST.color.sub, marginTop: 6 }}>Enter the kitchen passcode</div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ width: 14, height: 14, borderRadius: 999, background: i < code.length ? ST.color.accent : 'transparent', border: '1.5px solid ' + (i < code.length ? ST.color.accent : ST.color.line) }}></span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 12 }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => (
            k === '' ? <span key={i}></span> :
            <button key={i} onClick={() => press(k)} style={{ height: 64, borderRadius: 999, background: ST.color.surface, border: '1px solid ' + ST.color.line, fontSize: k === 'del' ? 13 : 22, fontFamily: ST.font.serif, fontWeight: 600, textAlign: 'center', color: k === 'del' ? ST.color.sub : ST.color.ink }}>{k === 'del' ? 'Delete' : k}</button>
          ))}
        </div>
      </div>
    </ScreenShell>
  );
}

// ---------- Identity picker ----------
function IdentityScreen({ onPick }) {
  return (
    <ScreenShell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: ST.font.serif, fontSize: 26, fontWeight: 700 }}>Who is this phone?</div>
          <div style={{ fontSize: 14, color: ST.color.sub, marginTop: 6 }}>Edits and comments carry your name</div>
        </div>
        {['Rajat', 'Tuhina'].map((who) => (
          <button key={who} onClick={() => onPick(who)} style={{ background: ST.color.surface, border: '1px solid ' + ST.color.line, borderRadius: ST.radius.card, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <window.Avatar who={who} size={44} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontFamily: ST.font.serif, fontSize: 19, fontWeight: 600 }}>I am {who}</div>
              <div style={{ fontSize: 13, color: ST.color.sub, marginTop: 2 }}>Stored on this phone only</div>
            </div>
          </button>
        ))}
      </div>
    </ScreenShell>
  );
}

// ---------- Change summary line (Menu header) ----------
// Three states: no changes, one change, several changes (possibly by both people).
function ChangeSummary({ activity, onOpen }) {
  const { Avatar } = window;
  if (activity.length === 0) {
    return <div style={{ fontSize: 13, color: ST.color.sub, marginTop: 8 }}>No changes this week yet</div>;
  }
  const latest = activity[0];
  if (activity.length === 1) {
    return (
      <button onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, textAlign: 'left' }}>
        <Avatar who={latest.who} size={22} />
        <span style={{ fontSize: 13, color: ST.color.sub }}>{latest.text}, {latest.when.toLowerCase()} ›</span>
      </button>
    );
  }
  const whos = [...new Set(activity.map((a) => a.who))];
  return (
    <button onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, textAlign: 'left' }}>
      <span style={{ display: 'flex' }}>
        {whos.map((w, i) => (
          <span key={w} style={{ marginLeft: i === 0 ? 0 : -7, borderRadius: 999, border: '2px solid ' + ST.color.bg, display: 'inline-flex' }}><Avatar who={w} size={22} /></span>
        ))}
      </span>
      <span style={{ fontSize: 13, color: ST.color.sub }}>
        {activity.length} changes by {whos.join(' and ')}, latest {latest.when.toLowerCase()} ›
      </span>
    </button>
  );
}

// ---------- Menu, the current week ----------
function MenuScreen({ week, activity, identity, onTab, onShare, onOpenDay, onSwitchIdentity }) {
  const { DayCard, Avatar, PrimaryButton } = window;
  return (
    <ScreenShell>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} data-screen-label="Menu, current week">
        <div style={{ padding: '54px 20px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: ST.font.serif, fontSize: 26, fontWeight: 700, whiteSpace: 'nowrap' }}>This week</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 13.5, color: ST.color.sub, whiteSpace: 'nowrap' }}>Jun 15 to 20</span>
              <button onClick={onSwitchIdentity} aria-label="Switch person"><Avatar who={identity} /></button>
            </div>
          </div>
          <ChangeSummary activity={activity} onOpen={() => onTab('Changes')} />
        </div>
        <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {week.map((day) => <DayCard key={day.id} day={day} showImages onEdit={() => onOpenDay(day.id)} />)}
        </div>
      </div>
      <div style={{ padding: '10px 16px 12px', flexShrink: 0 }}>
        <PrimaryButton onClick={onShare}>Share this week</PrimaryButton>
      </div>
      <window.TabBar active="Menu" onTab={onTab} />
    </ScreenShell>
  );
}

// ---------- One day, opened from a Menu day card ----------
function DayScreen({ day, onBack, onDishMenu, onDishDetails, onAddDish, onSkipDay, onRestoreDay, onTab }) {
  const { Card, DishRow, SectionLabel, PrimaryButton } = window;
  const meals = [['Breakfast', 'breakfast'], ['Lunch', 'lunch']].filter(([, m]) => day[m].length > 0);
  return (
    <ScreenShell>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} data-screen-label={'Day, ' + day.day}>
        <div style={{ padding: '54px 20px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} aria-label="Back" style={{ fontSize: 24, color: ST.color.sub, minWidth: 44, minHeight: 44, textAlign: 'left' }}>‹</button>
          <div>
            <div style={{ fontFamily: ST.font.serif, fontSize: 22, fontWeight: 700, whiteSpace: 'nowrap' }}>{day.day}, Jun {day.date}</div>
            <div style={{ fontSize: 13, color: ST.color.sub, marginTop: 2 }}>Changes apply to this week right away</div>
          </div>
        </div>
        {day.skipped ? (
          <div style={{ padding: '6px 16px 16px' }}>
            <Card style={{ padding: '24px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: ST.font.serif, fontSize: 20, fontWeight: 700 }}>This day is skipped</div>
              <div style={{ fontSize: 14, color: ST.color.sub, marginTop: 6 }}>"{day.skipped.reason}"</div>
              <div style={{ fontSize: 12.5, color: ST.color.sub, marginTop: 4 }}>No dishes, no groceries counted for it.</div>
              <PrimaryButton onClick={onRestoreDay} style={{ marginTop: 16 }}>Restore this day</PrimaryButton>
            </Card>
          </div>
        ) : (
          <div style={{ padding: '6px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {meals.map(([label, m]) => (
              <Card key={m} style={{ padding: '14px 16px' }}>
                <SectionLabel>{label}</SectionLabel>
                {day[m].map((e, i) => (
                  <DishRow key={i} entry={e} onClick={() => (e.key ? onDishDetails(day.id, m, i) : onDishMenu(day.id, m, i))}
                    trailing={<button onClick={(ev) => { ev.stopPropagation(); onDishMenu(day.id, m, i); }} aria-label="Dish actions" style={{ color: ST.color.sub, fontSize: 20, minWidth: 44, minHeight: 44 }}>⋯</button>} />
                ))}
              </Card>
            ))}
            <button onClick={onAddDish} style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: ST.color.accent, border: '1.5px dashed ' + ST.color.accent, borderRadius: ST.radius.control, padding: '12px 0', minHeight: 48 }}>Add a dish</button>
            <button onClick={onSkipDay} style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: ST.color.danger, border: '1px solid ' + ST.color.dangerLine, borderRadius: ST.radius.control, padding: '12px 0', minHeight: 48, background: ST.color.surface }}>Skip this day</button>
          </div>
        )}
      </div>
      <window.TabBar active="Menu" onTab={onTab} />
    </ScreenShell>
  );
}

// ---------- Grocery ----------
function GroceryScreen({ onTab }) {
  const { Card, SectionLabel } = window;
  const G = window.PlantryData.GROCERY;
  const count = G.reduce((n, g) => n + g.items.length, 0);
  return (
    <ScreenShell>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} data-screen-label="Grocery">
        <div style={{ padding: '54px 20px 12px' }}>
          <div style={{ fontFamily: ST.font.serif, fontSize: 26, fontWeight: 700 }}>Grocery</div>
          <div style={{ fontSize: 13.5, color: ST.color.sub, marginTop: 2 }}>{count} items to order for Jun 15 to 20</div>
        </div>
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {G.map((g) => (
            <Card key={g.group} style={{ padding: '14px 16px' }}>
              <SectionLabel>{g.group}</SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {g.items.map((it) => <span key={it} style={{ fontSize: 13.5, background: ST.color.bg, borderRadius: 999, padding: '6px 13px' }}>{it}</span>)}
              </div>
            </Card>
          ))}
        </div>
      </div>
      <window.TabBar active="Grocery" onTab={onTab} />
    </ScreenShell>
  );
}

// ---------- Changes, everything done to this week ----------
function ChangesScreen({ activity, onTab }) {
  const { Card, Avatar } = window;
  return (
    <ScreenShell>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} data-screen-label="Changes">
        <div style={{ padding: '54px 20px 12px' }}>
          <div style={{ fontFamily: ST.font.serif, fontSize: 26, fontWeight: 700 }}>Changes</div>
          <div style={{ fontSize: 13.5, color: ST.color.sub, marginTop: 2 }}>Everything done to this week's menu</div>
        </div>
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activity.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: ST.color.sub, fontSize: 14 }}>
              No changes yet. The week is as the menu was made.
            </div>
          )}
          {activity.map((a, i) => (
            <Card key={i} style={{ padding: '14px 16px', display: 'flex', gap: 12 }}>
              <Avatar who={a.who} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.35 }}>{a.text}</div>
                <div style={{ fontSize: 12.5, color: ST.color.sub, marginTop: 3 }}>{a.who} · {a.when}</div>
                {a.reason && <div style={{ fontSize: 13, color: ST.color.ink, marginTop: 7, background: ST.color.bg, borderRadius: 10, padding: '8px 12px' }}>"{a.reason}"</div>}
              </div>
            </Card>
          ))}
        </div>
      </div>
      <window.TabBar active="Changes" onTab={onTab} />
    </ScreenShell>
  );
}

// ---------- Explore ----------
function ExploreScreen({ history, onOpenDish, onTab }) {
  const { Chip, ComplexityTag } = window;
  const D = window.PlantryData.DISHES;
  const WHY = window.PlantryData.EXPLORE_WHY;
  const [filters, setFilters] = useState([]);
  const toggle = (f) => setFilters(filters.includes(f) ? filters.filter((x) => x !== f) : [...filters, f]);
  const never = Object.keys(D).filter((k) => D[k].lastCooked === 'Never' && !history.includes(k));
  const ranked = [...never].sort((a, b) => (Object.keys(WHY).indexOf(a) + 99 * (Object.keys(WHY).indexOf(a) < 0)) - (Object.keys(WHY).indexOf(b) + 99 * (Object.keys(WHY).indexOf(b) < 0)));
  const visible = ranked.filter((k) => {
    const d = D[k];
    if (filters.includes('Easy to cook') && d.complexity !== 'Easy') return false;
    if (filters.includes('Healthy') && !d.healthy) return false;
    if (filters.includes('Breakfast') && d.meal !== 'Breakfast') return false;
    if (filters.includes('Lunch') && d.meal !== 'Lunch') return false;
    return true;
  });
  return (
    <ScreenShell>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} data-screen-label="Explore">
        <div style={{ padding: '54px 20px 10px' }}>
          <div style={{ fontFamily: ST.font.serif, fontSize: 26, fontWeight: 700 }}>Explore</div>
          <div style={{ fontSize: 13.5, color: ST.color.sub, marginTop: 2 }}>{never.length} dishes you have not cooked yet</div>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '4px 16px 12px', flexWrap: 'wrap' }}>
          {['Easy to cook', 'Healthy', 'Breakfast', 'Lunch'].map((f) => (
            <Chip key={f} active={filters.includes(f)} onClick={() => toggle(f)}>{f}</Chip>
          ))}
        </div>
        <div style={{ padding: '0 16px', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: ST.color.sub, marginBottom: 8 }}>Close to your usual, new on the plate</div>
        {visible.length === 0 && <div style={{ padding: '24px 16px', color: ST.color.sub, fontSize: 14 }}>Nothing matches these filters this season.</div>}
        <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start' }}>
          {visible.map((k) => {
            const d = D[k];
            return (
              <button key={k} onClick={() => onOpenDish(k)} style={{ background: ST.color.surface, borderRadius: 16, border: '1px solid ' + ST.color.line, overflow: 'hidden', textAlign: 'left', display: 'block' }}>
                <img src={d.img} style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: '10px 12px 12px' }}>
                  <div style={{ fontFamily: ST.font.serif, fontSize: 15.5, fontWeight: 600, lineHeight: 1.25 }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: ST.color.sub, marginTop: 3 }}>{d.protein}g protein · {d.time} min</div>
                  {WHY[k] && <div style={{ fontSize: 12, color: ST.color.accent, marginTop: 4, lineHeight: 1.35 }}>{WHY[k]}</div>}
                  <div style={{ marginTop: 7 }}>
                    <ComplexityTag level={d.complexity} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <window.TabBar active="Explore" onTab={onTab} />
    </ScreenShell>
  );
}

Object.assign(window, { ScreenShell, GateScreen, IdentityScreen, ChangeSummary, MenuScreen, DayScreen, GroceryScreen, ChangesScreen, ExploreScreen });
