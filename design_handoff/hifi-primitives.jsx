// Plantry shared primitives. Everything reads tokens from window.PT.
const { useState, useEffect, useRef } = React;
const T = window.PT;

function Avatar({ who, size }) {
  const s = size || 24;
  return (
    <span style={{ width: s, height: s, borderRadius: 999, background: T.color.accentSoft, color: T.color.accent, fontSize: s * 0.48, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.font.sans, flexShrink: 0 }}>{who ? who[0] : '?'}</span>
  );
}

function SectionLabel({ children, color, style }) {
  return <div style={Object.assign({ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: color || T.color.green, fontWeight: 600, fontFamily: T.font.sans }, style)}>{children}</div>;
}

function Chip({ children, active, danger, onClick, style }) {
  return (
    <button onClick={onClick} style={Object.assign({
      fontSize: 13, fontWeight: 600, borderRadius: T.radius.pill, padding: '8px 14px', fontFamily: T.font.sans, whiteSpace: 'nowrap',
      background: active ? T.color.accent : T.color.surface,
      color: danger ? T.color.danger : active ? T.color.onAccent : T.color.ink,
      border: '1px solid ' + (active ? T.color.accent : T.color.line),
    }, style)}>{children}</button>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button onClick={onChange} aria-pressed={on} style={{ width: 42, height: 25, borderRadius: 999, background: on ? T.color.green : T.color.line, position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 20 : 3, width: 19, height: 19, borderRadius: 999, background: '#FFF', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}></span>
    </button>
  );
}

function Thumb({ src, size, radius }) {
  return src
    ? <img src={src} style={{ width: size || 48, height: size || 48, borderRadius: radius || T.radius.thumb, objectFit: 'cover', flexShrink: 0 }} />
    : <span style={{ width: size || 48, height: size || 48, borderRadius: radius || T.radius.thumb, flexShrink: 0, background: 'repeating-linear-gradient(45deg, #EFE8DB, #EFE8DB 6px, #E7DFD0 6px, #E7DFD0 12px)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.color.sub, fontSize: 16, fontFamily: T.font.serif }}>+</span>;
}

// One dish inside a day. entry = { key } or { custom }. Trailing is the caller's affordance.
function DishRow({ entry, trailing, onClick, compact }) {
  const d = entry.key ? window.PlantryData.DISHES[entry.key] : null;
  const name = d ? d.name : entry.custom;
  const meta = d ? `${d.protein}g protein · ${d.time} min` : 'One off this week';
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: compact ? '7px 0' : '9px 0', cursor: onClick ? 'pointer' : 'default' }}>
      <Thumb src={d && d.img} size={compact ? 40 : 48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.font.serif, fontSize: compact ? 15.5 : 16.5, fontWeight: 600, lineHeight: 1.25, color: T.color.ink }}>{name}</div>
        <div style={{ fontSize: 12.5, color: T.color.sub, marginTop: 2, fontFamily: T.font.sans }}>
          {meta}
          {d && d.prep && <span style={{ color: '#8A6D3B', fontWeight: 600 }}> · Pre prep</span>}
        </div>
      </div>
      {trailing}
    </div>
  );
}

function DateBadge({ short, date }) {
  return (
    <div style={{ width: 52, flexShrink: 0, textAlign: 'center', paddingTop: 2, fontFamily: T.font.sans }}>
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.color.sub }}>{short}</div>
      <div style={{ fontFamily: T.font.serif, fontSize: 30, fontWeight: 600, lineHeight: 1.1, color: T.color.ink }}>{date}</div>
      <div style={{ fontSize: 11, color: T.color.sub }}>Jun</div>
    </div>
  );
}

function Card({ children, onClick, style }) {
  return (
    <div onClick={onClick} style={Object.assign({ background: T.color.surface, borderRadius: T.radius.card, border: '1px solid ' + T.color.line, cursor: onClick ? 'pointer' : 'default' }, style)}>{children}</div>
  );
}

// Day card for the Menu view. onEdit shows the per-day edit affordance.
// A skipped day shows its reason in place of meals.
function DayCard({ day, showImages, onEdit }) {
  const meals = [['Breakfast', day.breakfast], ['Lunch', day.lunch]].filter(([, v]) => v.length > 0);
  return (
    <Card data-comment-anchor={'day-' + day.id} style={{ padding: '16px 16px 8px', display: 'flex', gap: 14, position: 'relative' }}>
      <DateBadge short={day.short} date={day.date} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {day.skipped ? (
          <div style={{ padding: '6px 0 14px' }}>
            <div style={{ fontFamily: T.font.serif, fontSize: 16.5, fontWeight: 600, color: T.color.sub }}>Skipped</div>
            <div style={{ fontSize: 13, color: T.color.sub, marginTop: 3, fontFamily: T.font.sans }}>"{day.skipped.reason}"</div>
          </div>
        ) : meals.map(([label, entries]) => (
          <div key={label} style={{ marginBottom: 4 }}>
            <SectionLabel>{label}</SectionLabel>
            {entries.map((e, i) => <DishRow key={i} entry={e} compact={!showImages} />)}
          </div>
        ))}
      </div>
      {onEdit && (
        <button onClick={onEdit} aria-label={'Edit ' + day.day} style={{ position: 'absolute', top: 12, right: 12, fontSize: 12.5, fontWeight: 600, color: T.color.accent, background: T.color.accentSoft, borderRadius: 999, padding: '7px 14px', fontFamily: T.font.sans }}>Edit</button>
      )}
    </Card>
  );
}

function TabBar({ active, onTab }) {
  return (
    <div style={{ display: 'flex', borderTop: '1px solid ' + T.color.line, background: T.color.surface, padding: '10px 10px calc(14px + env(safe-area-inset-bottom, 12px))', flexShrink: 0 }}>
      {['Menu', 'Grocery', 'Explore', 'Changes'].map((t) => (
        <button key={t} onClick={() => onTab(t)} style={{ flex: 1, textAlign: 'center', fontSize: 14, fontFamily: T.font.sans, fontWeight: t === active ? 700 : 400, color: t === active ? T.color.accent : T.color.sub, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minHeight: 44, justifyContent: 'center' }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: t === active ? T.color.accent : 'transparent' }}></span>
          {t}
        </button>
      ))}
    </div>
  );
}

function PrimaryButton({ children, onClick, style }) {
  return <button onClick={onClick} style={Object.assign({ background: T.color.accent, color: T.color.onAccent, borderRadius: T.radius.control, padding: '14px 0', textAlign: 'center', fontSize: 15.5, fontWeight: 600, fontFamily: T.font.sans, width: '100%', minHeight: 48 }, style)}>{children}</button>;
}

function QuietButton({ children, onClick, danger, style }) {
  return <button onClick={onClick} style={Object.assign({ background: T.color.surface, color: danger ? T.color.danger : T.color.ink, border: '1px solid ' + (danger ? T.color.dangerLine : T.color.line), borderRadius: T.radius.control, padding: '13px 0', textAlign: 'center', fontSize: 15, fontWeight: 600, fontFamily: T.font.sans, width: '100%', minHeight: 48 }, style)}>{children}</button>;
}

function SearchField({ value, onChange, placeholder, autoFocus }) {
  return (
    <input value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', background: T.color.surface, border: '1px solid ' + T.color.line, borderRadius: T.radius.control, padding: '12px 16px', fontSize: 15, fontFamily: T.font.sans, color: T.color.ink, outline: 'none', minHeight: 46 }} />
  );
}

// Bottom sheet with scrim. Children scroll if tall.
function Sheet({ onClose, children, maxHeight }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: T.color.scrim }}></div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: T.color.surface, borderRadius: '24px 24px 0 0', padding: '10px 18px calc(18px + env(safe-area-inset-bottom, 8px))', maxHeight: maxHeight || '88%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: T.color.line, margin: '0 auto 10px', flexShrink: 0 }}></div>
        <div style={{ overflowY: 'auto', minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <div style={{ background: T.color.bg, borderRadius: T.radius.chip, padding: '8px 10px', fontFamily: T.font.sans }}>
      <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.color.sub }}>{label}</div>
      <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 2, color: T.color.ink }}>{value}</div>
    </div>
  );
}

function ComplexityTag({ level }) {
  const map = { Easy: [T.color.green, T.color.greenSoft], Medium: ['#8A6D3B', '#F2E8D5'], Hard: [T.color.danger, T.color.accentSoft] };
  const [fg, bg] = map[level] || map.Easy;
  const label = (window.PlantryData.COMPLEXITY_LABELS || {})[level] || level;
  return <span style={{ fontSize: 11, fontWeight: 600, color: fg, background: bg, borderRadius: 999, padding: '3px 9px', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>{label}</span>;
}

function InfoDot() {
  return <span style={{ display: 'inline-flex', width: 17, height: 17, borderRadius: 999, border: '1.5px solid ' + T.color.accent, color: T.color.accent, fontSize: 11, alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontFamily: T.font.sans, verticalAlign: '-2px' }}>i</span>;
}

Object.assign(window, { Avatar, SectionLabel, Chip, Toggle, Thumb, DishRow, DateBadge, Card, DayCard, TabBar, PrimaryButton, QuietButton, SearchField, Sheet, StatChip, ComplexityTag, InfoDot });
