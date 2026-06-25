import React from 'react';

/** yyyy-mm-dd → dd-mm-yyyy for display labels */
export function formatDateDMY(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
}

export function clampDateRange(from, to, field) {
  if (field === 'from' && from && to && from > to) return { from, to: from };
  if (field === 'to' && to && from && to < from) return { from: to, to };
  return { from, to };
}

const MANAGER = {
  primary: '#378ADD',
  primaryDark: '#185FA5',
  border: '#E8E8E5',
  textMuted: '#999999',
  cardBg: '#ffffff',
};

/**
 * Standard date-range control: From · To · Apply (+ optional Today).
 * Edits draft dates only; parent applies on button click.
 */
export default function DateRangeApply({
  draftFrom,
  draftTo,
  onDraftFromChange,
  onDraftToChange,
  onApply,
  onToday,
  loading = false,
  showToday = true,
  variant = 'manager',
}) {
  const handleFrom = (value) => {
    const next = clampDateRange(value, draftTo, 'from');
    onDraftFromChange(next.from);
    if (next.to !== draftTo) onDraftToChange(next.to);
  };

  const handleTo = (value) => {
    const next = clampDateRange(draftFrom, value, 'to');
    if (next.from !== draftFrom) onDraftFromChange(next.from);
    onDraftToChange(next.to);
  };

  if (variant === 'kds') {
    return (
      <div className="kds-history-filters">
        <label className="kds-date-field">
          <span>From · {formatDateDMY(draftFrom)}</span>
          <input
            type="date"
            className="kds-date-input"
            value={draftFrom}
            max={draftTo}
            onChange={(e) => handleFrom(e.target.value)}
          />
        </label>
        <label className="kds-date-field">
          <span>To · {formatDateDMY(draftTo)}</span>
          <input
            type="date"
            className="kds-date-input"
            value={draftTo}
            min={draftFrom}
            onChange={(e) => handleTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="kds-date-apply-btn"
          onClick={onApply}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Apply'}
        </button>
        {showToday && (
          <button type="button" className="kds-date-today-btn" onClick={onToday}>
            Today
          </button>
        )}
      </div>
    );
  }

  const inputStyle = {
    display: 'block',
    marginTop: 4,
    padding: '6px 8px',
    borderRadius: 6,
    border: `0.5px solid ${MANAGER.border}`,
    fontSize: 13,
    minWidth: 148,
  };

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <label style={{ fontSize: 11, color: MANAGER.textMuted }}>
        From · {formatDateDMY(draftFrom)}
        <input
          type="date"
          value={draftFrom}
          max={draftTo}
          onChange={(e) => handleFrom(e.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={{ fontSize: 11, color: MANAGER.textMuted }}>
        To · {formatDateDMY(draftTo)}
        <input
          type="date"
          value={draftTo}
          min={draftFrom}
          onChange={(e) => handleTo(e.target.value)}
          style={inputStyle}
        />
      </label>
      <button
        type="button"
        onClick={onApply}
        disabled={loading}
        style={{
          padding: '7px 16px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 500,
          cursor: loading ? 'wait' : 'pointer',
          border: `0.5px solid ${MANAGER.primaryDark}`,
          background: MANAGER.primary,
          color: '#fff',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Loading…' : 'Apply'}
      </button>
      {showToday && (
        <button
          type="button"
          onClick={onToday}
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            fontSize: 12,
            cursor: 'pointer',
            border: `0.5px solid ${MANAGER.border}`,
            background: MANAGER.cardBg,
            color: MANAGER.textMuted,
          }}
        >
          Today
        </button>
      )}
    </div>
  );
}
