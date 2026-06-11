// Plantry overlays: action sheet, dish details, swap picker, reason dialog,
// one off composer, comment composer, day picker, share preview.
const { useState: useOvState } = React;
const OT = window.PT;

// ---------- Dish action sheet ----------
function DishActionSheet({ entry, onReplace, onDetails, onDelete, onClose }) {
  const { Sheet, DishRow } = window;
  const row = (label, hint, onClick, danger) => (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '15px 4px', borderTop: '1px solid ' + OT.color.line, minHeight: 52 }}>
      <span style={{ fontSize: 16, fontWeight: 600, color: danger ? OT.color.danger : OT.color.ink, fontFamily: OT.font.sans }}>{label}</span>
      <span style={{ fontSize: 12.5, color: OT.color.sub, fontFamily: OT.font.sans }}>{hint}</span>
    </button>
  );
  return (
    <Sheet onClose={onClose}>
      <DishRow entry={entry} />
      <div style={{ marginTop: 6 }}>
        {entry.key && row('Details and recipe', 'Cooking info, protein', onDetails)}
        {row('Replace', 'Pick another dish', onReplace)}
        {row('Delete', 'Remove from this day', onDelete, true)}
      </div>
    </Sheet>
  );
}

// ---------- Dish details sheet ----------
// context: 'week' (replace, remove) or 'explore' (use this week)
function DishDetailSheet({ dishKey, context, includeRecipe, onToggleRecipe, onReplace, onDelete, onUse, onUseNextWeek, onComment, onClose, defaultOpen }) {
  const { Sheet, StatChip, InfoDot, PrimaryButton, QuietButton, Toggle, SectionLabel } = window;
  const d = window.PlantryData.DISHES[dishKey];
  const [showInfo, setShowInfo] = useOvState(!!defaultOpen || context === 'explore');
  const complexityLabel = (window.PlantryData.COMPLEXITY_LABELS || {})[d.complexity] || d.complexity;
  return (
    <Sheet onClose={onClose}>
      <img src={d.img} style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 16 }} />
      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily: OT.font.serif, fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{d.name}</div>
        {d.desc && <div style={{ fontSize: 13.5, color: OT.color.ink, marginTop: 4, lineHeight: 1.45 }}>{d.desc}</div>}
        <div style={{ fontSize: 12.5, color: OT.color.sub, marginTop: 4 }}>{d.meal} · {d.lastCooked === 'Never' ? 'Not cooked yet' : 'Last cooked ' + d.lastCooked.toLowerCase()}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
        <StatChip label="Protein" value={d.protein + 'g'} />
        <StatChip label="Protein to carb" value={d.pc.toFixed(1)} />
        <StatChip label="Time" value={d.time + ' min'} />
      </div>
      <div style={{ background: OT.color.bg, borderRadius: 14, padding: '12px 12px', marginTop: 8 }}>
        <button onClick={() => setShowInfo(!showInfo)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 32 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, fontFamily: OT.font.sans }}>{complexityLabel}&nbsp;&nbsp;<InfoDot /></span>
          <span style={{ fontSize: 12, color: OT.color.sub, fontFamily: OT.font.sans }}>{showInfo ? 'Hide details' : 'Show details'}</span>
        </button>
        {showInfo && (
          <div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 8, fontFamily: OT.font.sans }}>
              <div><span style={{ color: OT.color.sub }}>Skill:</span> {d.cook.skill}</div>
              <div><span style={{ color: OT.color.sub }}>Equipment:</span> {d.cook.equipment}</div>
              <div><span style={{ color: OT.color.sub }}>Buy specially:</span> {d.cook.special}</div>
              {d.prep && <div><span style={{ color: OT.color.sub }}>Pre prep:</span> <span style={{ color: '#8A6D3B', fontWeight: 600 }}>{d.prep}</span></div>}
              <div><span style={{ color: OT.color.sub }}>Time:</span> About {d.time} minutes</div>
            </div>
            <div style={{ borderTop: '1px solid ' + OT.color.line, marginTop: 10, paddingTop: 10 }}>
              <SectionLabel color={OT.color.sub} style={{ marginBottom: 6 }}>Recipe</SectionLabel>
              {d.cook.recipe.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13.5, lineHeight: 1.45, marginBottom: 5, fontFamily: OT.font.sans }}>
                  <span style={{ fontFamily: OT.font.serif, color: OT.color.accent, fontWeight: 700 }}>{i + 1}</span><span>{s}</span>
                </div>
              ))}
              {context === 'week' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, background: OT.color.surface, borderRadius: 12, padding: '10px 12px' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, fontFamily: OT.font.sans }}>Include recipe when sharing</span>
                  <Toggle on={!!includeRecipe} onChange={onToggleRecipe} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        {context === 'week' ? (
          <React.Fragment>
            <PrimaryButton onClick={onReplace} style={{ flex: 1.4 }}>Replace this dish</PrimaryButton>
            <QuietButton onClick={onDelete} danger style={{ flex: 1 }}>Remove</QuietButton>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <PrimaryButton onClick={onUse} style={{ flex: 1.4 }}>Use this week</PrimaryButton>
            <QuietButton onClick={onUseNextWeek} style={{ flex: 1 }}>Next week</QuietButton>
          </React.Fragment>
        )}
      </div>
      {context === 'week' && (
        <button onClick={onComment} style={{ width: '100%', textAlign: 'center', fontSize: 13.5, fontWeight: 600, color: OT.color.sub, padding: '14px 0 4px', fontFamily: OT.font.sans }}>Leave a comment for the review</button>
      )}
    </Sheet>
  );
}

// ---------- Swap picker ----------
// Ranks dishes that fit the day and meal first, then the rest of the matching library.
function weeksAgo(lastCooked) {
  if (lastCooked === 'Never') return 99;
  const m = lastCooked.match(/(\d+)/);
  if (lastCooked === 'Last week') return 1;
  if (m) return lastCooked.includes('day') ? Math.round(m[1] / 7 * 10) / 10 : Number(m[1]);
  return 0;
}

function rankCandidates(meal, day, outgoingKey) {
  const D = window.PlantryData.DISHES;
  const inDay = new Set([...day.breakfast, ...day.lunch].map((e) => e.key).filter(Boolean));
  const out = outgoingKey ? D[outgoingKey] : null;
  return Object.keys(D)
    .filter((k) => D[k].meal === meal && k !== outgoingKey && !inDay.has(k))
    .map((k) => {
      const d = D[k];
      const recency = Math.min(4, weeksAgo(d.lastCooked));
      const similarity = out ? 1 - Math.min(1, Math.abs(d.protein - out.protein) / 30) : 0.5;
      return { k, score: recency + similarity * 2 };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.k);
}

function SwapPickerSheet({ dayId, meal, outgoingKey, onPick, onClose }) {
  const { Sheet, SearchField, DishRow, SectionLabel, ComplexityTag } = window;
  const D = window.PlantryData.DISHES;
  const day = window.PlantryAppWeek ? window.PlantryAppWeek.find((d) => d.id === dayId) : null;
  const [q, setQ] = useOvState('');
  const ranked = day ? rankCandidates(meal === 'breakfast' ? 'Breakfast' : 'Lunch', day, outgoingKey) : [];
  const match = (k) => D[k].name.toLowerCase().includes(q.toLowerCase());
  const top = ranked.filter(match).slice(0, 4);
  const rest = ranked.filter(match).slice(4);
  const row = (k) => (
    <button key={k} onClick={() => onPick(k)} style={{ width: '100%', textAlign: 'left', display: 'block' }}>
      <DishRow entry={{ key: k }} trailing={
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ComplexityTag level={D[k].complexity} />
          {D[k].lastCooked === 'Never' && <span style={{ fontSize: 11, fontWeight: 600, color: OT.color.accent, fontFamily: OT.font.sans }}>New</span>}
        </span>} />
    </button>
  );
  return (
    <Sheet onClose={onClose} maxHeight="92%">
      <div style={{ fontFamily: OT.font.serif, fontSize: 20, fontWeight: 700, marginBottom: 2 }}>
        {outgoingKey ? 'Replace ' + D[outgoingKey].name : 'Pick a dish'}
      </div>
      <div style={{ fontSize: 13, color: OT.color.sub, marginBottom: 12, fontFamily: OT.font.sans }}>{day ? day.day : ''} {meal}</div>
      <SearchField value={q} onChange={setQ} placeholder="Search dishes" />
      {top.length > 0 && <SectionLabel style={{ margin: '14px 0 2px' }}>Fits this day</SectionLabel>}
      {top.map(row)}
      {rest.length > 0 && <SectionLabel color={OT.color.sub} style={{ margin: '14px 0 2px' }}>More {meal} dishes</SectionLabel>}
      {rest.map(row)}
      {top.length + rest.length === 0 && <div style={{ padding: '20px 0', color: OT.color.sub, fontSize: 14, fontFamily: OT.font.sans }}>No dish matches that name.</div>}
    </Sheet>
  );
}

// ---------- Reason dialog (required for swaps, one offs, deletes) ----------
function ReasonDialog({ title, hint, submitLabel, onSubmit, onClose }) {
  const { Sheet, Chip, PrimaryButton } = window;
  const [text, setText] = useOvState('');
  const quick = ['Eating out', 'Not in season', 'Too heavy this week', 'Craving it', 'Guests over'];
  return (
    <Sheet onClose={onClose}>
      <div style={{ fontFamily: OT.font.serif, fontSize: 20, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 13, color: OT.color.sub, marginTop: 4, fontFamily: OT.font.sans }}>{hint || 'A short reason helps the weekly review.'}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
        {quick.map((qr) => <Chip key={qr} active={text === qr} onClick={() => setText(qr)} style={{ padding: '7px 12px', fontSize: 12.5 }}>{qr}</Chip>)}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Why this change?" rows={3}
        style={{ width: '100%', background: OT.color.bg, border: '1px solid ' + OT.color.line, borderRadius: 14, padding: '12px 14px', fontSize: 15, fontFamily: OT.font.sans, color: OT.color.ink, outline: 'none', resize: 'none' }} />
      <PrimaryButton onClick={() => text.trim() && onSubmit(text.trim())} style={{ marginTop: 12, opacity: text.trim() ? 1 : 0.4 }}>{submitLabel || 'Save change'}</PrimaryButton>
    </Sheet>
  );
}

// ---------- Add a dish (library search plus one off) ----------
function AddDishSheet({ dayId, onPickLibrary, onPickCustom, onClose }) {
  const { Sheet, Chip, SearchField, DishRow, SectionLabel, ComplexityTag } = window;
  const D = window.PlantryData.DISHES;
  const [q, setQ] = useOvState('');
  const [meal, setMeal] = useOvState('lunch');
  const day = window.PlantryAppWeek ? window.PlantryAppWeek.find((d) => d.id === dayId) : null;
  const noBreakfast = day && day.id === 'sat';
  const ranked = day ? rankCandidates(meal === 'breakfast' ? 'Breakfast' : 'Lunch', day, null) : [];
  const visible = ranked.filter((k) => D[k].name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet onClose={onClose} maxHeight="92%">
      <div style={{ fontFamily: OT.font.serif, fontSize: 20, fontWeight: 700 }}>Add a dish</div>
      <div style={{ fontSize: 13, color: OT.color.sub, margin: '4px 0 12px', fontFamily: OT.font.sans }}>To {day ? day.day : 'this day'}; pick from the library or add a one off</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {!noBreakfast && <Chip active={meal === 'breakfast'} onClick={() => setMeal('breakfast')}>Breakfast</Chip>}
        <Chip active={meal === 'lunch'} onClick={() => setMeal('lunch')}>Lunch</Chip>
      </div>
      <SearchField value={q} onChange={setQ} placeholder="Search, or type a one off dish" />
      {q.trim() && (
        <button onClick={() => onPickCustom(q.trim(), meal)} style={{ width: '100%', textAlign: 'center', fontSize: 14, fontWeight: 600, color: OT.color.accent, border: '1.5px dashed ' + OT.color.accent, borderRadius: 14, padding: '12px 0', marginTop: 12, fontFamily: OT.font.sans }}>Add "{q.trim()}" as a one off</button>
      )}
      {visible.length > 0 && <SectionLabel style={{ margin: '14px 0 2px' }}>{q.trim() ? 'From the library' : 'Fits this day'}</SectionLabel>}
      {visible.map((k) => (
        <button key={k} onClick={() => onPickLibrary(k, meal)} style={{ width: '100%', textAlign: 'left', display: 'block' }}>
          <DishRow entry={{ key: k }} trailing={
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ComplexityTag level={D[k].complexity} />
              {D[k].lastCooked === 'Never' && <span style={{ fontSize: 11, fontWeight: 600, color: OT.color.accent, fontFamily: OT.font.sans }}>New</span>}
            </span>} />
        </button>
      ))}
    </Sheet>
  );
}

// ---------- Comment composer and list ----------
function CommentSheet({ dayId, dishLabel, comments, identity, onSubmit, onClose }) {
  const { Sheet, Avatar, PrimaryButton } = window;
  const [text, setText] = useOvState('');
  const day = window.PlantryAppWeek ? window.PlantryAppWeek.find((d) => d.id === dayId) : null;
  const dayComments = comments.filter((c) => c.dayId === dayId);
  return (
    <Sheet onClose={onClose}>
      <div style={{ fontFamily: OT.font.serif, fontSize: 20, fontWeight: 700 }}>Comments{dishLabel ? ', ' + dishLabel : day ? ', ' + day.day : ''}</div>
      <div style={{ fontSize: 13, color: OT.color.sub, margin: '4px 0 12px', fontFamily: OT.font.sans }}>Comments change nothing now; they queue for the weekly review.</div>
      {dayComments.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: '1px solid ' + OT.color.line }}>
          <Avatar who={c.who} size={26} />
          <div>
            <div style={{ fontSize: 12.5, color: OT.color.sub, fontFamily: OT.font.sans }}>{c.who} · {c.when}</div>
            <div style={{ fontSize: 14.5, marginTop: 2, fontFamily: OT.font.sans }}>{c.text}</div>
          </div>
        </div>
      ))}
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. too many gravies this day" rows={3}
        style={{ width: '100%', background: OT.color.bg, border: '1px solid ' + OT.color.line, borderRadius: 14, padding: '12px 14px', fontSize: 15, fontFamily: OT.font.sans, color: OT.color.ink, outline: 'none', resize: 'none', marginTop: 8 }} />
      <PrimaryButton onClick={() => text.trim() && onSubmit(text.trim())} style={{ marginTop: 12, opacity: text.trim() ? 1 : 0.4 }}>Add comment as {identity}</PrimaryButton>
    </Sheet>
  );
}

// ---------- Day picker (from Explore, "Use this week") ----------
function DayPickerSheet({ dishKey, onPick, onClose }) {
  const { Sheet, Chip } = window;
  const d = window.PlantryData.DISHES[dishKey];
  const week = window.PlantryAppWeek || [];
  const mealKey = d.meal === 'Breakfast' ? 'breakfast' : 'lunch';
  return (
    <Sheet onClose={onClose}>
      <div style={{ fontFamily: OT.font.serif, fontSize: 20, fontWeight: 700 }}>Add {d.name}</div>
      <div style={{ fontSize: 13, color: OT.color.sub, margin: '4px 0 10px', fontFamily: OT.font.sans }}>Pick which {d.meal.toLowerCase()} it replaces or joins</div>
      {week.map((day) => {
        if (day.id === 'sat' && mealKey === 'breakfast') return null;
        return (
          <button key={day.id} onClick={() => onPick(day.id, mealKey)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 4px', borderTop: '1px solid ' + OT.color.line, minHeight: 52 }}>
            <span style={{ fontFamily: OT.font.serif, fontSize: 16.5, fontWeight: 600 }}>{day.day}</span>
            <span style={{ fontSize: 12.5, color: OT.color.sub, fontFamily: OT.font.sans }}>{day[mealKey].length} {d.meal.toLowerCase()} {day[mealKey].length === 1 ? 'dish' : 'dishes'}</span>
          </button>
        );
      })}
    </Sheet>
  );
}

// ---------- Share preview ----------
// Images sit in a horizontal swipe rail, the way they arrive on WhatsApp.
function SharePreviewSheet({ week, onClose }) {
  const { Sheet, SectionLabel, PrimaryButton, MenuShareImage, GroceryShareImage, RecipeShareImage } = window;
  const withRecipes = [];
  week.forEach((day) => ['breakfast', 'lunch'].forEach((m) => day[m].forEach((e) => {
    if (e.key && e.includeRecipe) withRecipes.push(e.key);
  })));
  const slides = [
    { label: 'Menu', el: <MenuShareImage week={week} /> },
    { label: 'Grocery list', el: <GroceryShareImage /> },
    ...withRecipes.map((k, i) => ({ label: 'Recipe ' + (i + 1), el: <RecipeShareImage dishKey={k} /> })),
  ];
  return (
    <Sheet onClose={onClose} maxHeight="92%">
      <div style={{ fontFamily: OT.font.serif, fontSize: 20, fontWeight: 700, marginBottom: 2 }}>Share this week</div>
      <div style={{ fontSize: 13, color: OT.color.sub, marginBottom: 12, fontFamily: OT.font.sans }}>
        {slides.length} images, sent together. Swipe across to check them.
      </div>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', scrollSnapType: 'x mandatory', margin: '0 -18px', padding: '0 18px 6px' }}>
        {slides.map((s, i) => (
          <div key={i} style={{ flexShrink: 0, width: '82%', scrollSnapAlign: 'center' }}>
            <SectionLabel color={OT.color.sub} style={{ marginBottom: 8 }}>{(i + 1) + ' of ' + slides.length + ' · ' + s.label}</SectionLabel>
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid ' + OT.color.line, boxShadow: '0 8px 24px rgba(44,36,27,0.10)' }}>{s.el}</div>
          </div>
        ))}
      </div>
      {withRecipes.length === 0 && (
        <div style={{ fontSize: 12.5, color: OT.color.sub, margin: '10px 0 0', fontFamily: OT.font.sans }}>Turn on a dish's recipe toggle to add recipe sheets.</div>
      )}
      <PrimaryButton onClick={onClose} style={{ marginTop: 14 }}>Send on WhatsApp</PrimaryButton>
    </Sheet>
  );
}

Object.assign(window, { DishActionSheet, DishDetailSheet, SwapPickerSheet, ReasonDialog, AddDishSheet, CommentSheet, DayPickerSheet, SharePreviewSheet, rankCandidates });
