// ============================================================================
// MUNAFE — KOT PRINT MODULE
// src/components/KOTPrint.jsx
//
// EXPORTS
// ───────
//  KOTPrintTemplate   – Hidden React component that renders the ticket HTML.
//                       Mount it anywhere in your app; it stays invisible
//                       on-screen and appears only during printing.
//
//  useKOTPrint        – Hook that returns:
//                         printConsolidated(order)   → one ticket per ORDER
//                         printIndividual(order)     → one ticket per ITEM
//                         printCancellation(order)   → CANCEL ticket
//
//  KOTPrintButton     – Drop-in UI button (shows both modes + cancel).
//
// USAGE (waiter / POS screen)
// ────────────────────────────
//   import { KOTPrintTemplate, useKOTPrint } from './KOTPrint';
//
//   // 1. Mount the template once near the root of your app (or in the page)
//   <KOTPrintTemplate ref={kotRef} />
//
//   // 2. Use the hook wherever you need to trigger a print
//   const { printConsolidated, printIndividual } = useKOTPrint(kotRef);
//
//   // 3. Call after order is placed
//   await apiClient.post('/api/orders', payload);
//   printConsolidated(order);            // fires the print dialog
//
// PRINTER NOTES
// ─────────────
//  • Targets 80 mm thermal paper (576 px printable width at 203 dpi).
//    Change --kot-width to 384px for 58 mm paper.
//  • Set Chrome's default printer to the thermal printer and enable
//    "Skip print dialog" (chrome://settings/content/pdfDocuments → off)
//    for true silent printing from the POS terminal.
//  • For network/ESC-POS direct printing (unattended KDS auto-print),
//    see the companion kotEscPos.js module at the bottom of this file.
// ============================================================================

import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
  useState,
} from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const RESTAURANT_NAME  = 'MUNAFE';
const RESTAURANT_LINE2 = 'Fresh & Fast';            // tagline / address line
const PAPER_WIDTH_MM   = 80;                         // change to 58 if needed

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nowIST() {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day:    '2-digit',
    month:  'short',
    year:   '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function padEnd(str, len) {
  return String(str ?? '').padEnd(len).slice(0, len);
}

// Sequential KOT number per browser session (resets on reload — backend
// should maintain the real sequence; this is display-only).
let _kotSeq = 1;
function nextKotNumber() { return String(_kotSeq++).padStart(4, '0'); }

// ─── CSS injected into the page (screen-hidden, print-visible) ───────────────
// We inject a <style> once rather than using CSS modules / Tailwind,
// so this file is fully self-contained and portable.

const KOT_STYLE = `
  /* ── SCREEN: hide the print zone ───────────────────────────────────────── */
  @media screen {
    .kot-print-zone { display: none !important; }
  }

  /* ── PRINT: hide everything EXCEPT the print zone ──────────────────────── */
  @media print {
    body > *:not(.kot-print-root) { display: none !important; }
    .kot-print-root               { display: block !important; }
    .kot-print-zone               { display: block !important; }

    @page {
      margin: 0;
      size: ${PAPER_WIDTH_MM}mm auto;   /* auto height = continuous roll */
    }

    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }

  /* ── Ticket layout ──────────────────────────────────────────────────────── */
  :root {
    --kot-width:    ${PAPER_WIDTH_MM === 58 ? '384px' : '576px'};
    --kot-font:     'Courier New', Courier, monospace;  /* thermal-printer-safe */
    --kot-size-sm:  10px;
    --kot-size-md:  12px;
    --kot-size-lg:  15px;
    --kot-size-xl:  18px;
    --kot-pad:      6px 10px;
  }

  .kot-ticket {
    width: var(--kot-width);
    font-family: var(--kot-font);
    font-size: var(--kot-size-md);
    color: #000;
    background: #fff;
    padding: 6px 0 14px;
    page-break-after: always;
  }
  .kot-ticket:last-child { page-break-after: avoid; }

  /* Header */
  .kot-header       { text-align: center; padding: var(--kot-pad); }
  .kot-brand        { font-size: var(--kot-size-xl); font-weight: 900; letter-spacing: 3px; }
  .kot-brand-sub    { font-size: var(--kot-size-sm); letter-spacing: 1px; margin-top: 1px; }
  .kot-divider      { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  .kot-divider-solid{ border: none; border-top: 2px solid  #000; margin: 4px 0; }

  /* Meta row */
  .kot-meta         { display: flex; justify-content: space-between; padding: var(--kot-pad); font-size: var(--kot-size-sm); }
  .kot-meta-left    { display: flex; flex-direction: column; gap: 2px; }
  .kot-meta-right   { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .kot-meta-label   { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; opacity: .55; }
  .kot-meta-value   { font-weight: 700; font-size: var(--kot-size-md); }
  .kot-meta-value-lg{ font-weight: 900; font-size: var(--kot-size-xl); }

  /* Type banner — changes per mode */
  .kot-type-banner  {
    text-align: center;
    font-size: var(--kot-size-sm);
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    padding: 3px 10px;
    margin: 2px 0;
  }
  .kot-type-consolidated { background: #000; color: #fff; }
  .kot-type-individual   { background: #000; color: #fff; }
  .kot-type-cancel       { background: #000; color: #fff; border: 2px solid #000; }
  .kot-cancel-stamp {
    text-align: center;
    font-size: 22px;
    font-weight: 900;
    letter-spacing: 4px;
    border: 3px solid #000;
    margin: 6px 10px;
    padding: 4px 0;
  }

  /* Items table */
  .kot-items        { width: 100%; border-collapse: collapse; margin: 4px 0; }
  .kot-items th     {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .08em;
    padding: 3px 10px;
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    font-weight: 700;
  }
  .kot-items th:last-child, .kot-items td:last-child { text-align: right; }
  .kot-items td     { padding: 5px 10px; font-size: var(--kot-size-md); vertical-align: top; }
  .kot-items tr:not(:last-child) td { border-bottom: 1px dotted #ccc; }
  .kot-item-note    { font-size: 10px; font-style: italic; opacity: .7; display: block; margin-top: 1px; }
  .kot-item-sno     { width: 20px; opacity: .5; }
  .kot-item-qty     { width: 36px; font-weight: 900; font-size: var(--kot-size-lg); }

  /* Single-item highlight (individual mode) */
  .kot-single-item  {
    padding: 10px;
    text-align: center;
    font-size: 20px;
    font-weight: 900;
    letter-spacing: 1px;
    border: 2px solid #000;
    margin: 6px 10px;
  }
  .kot-single-qty   { font-size: 28px; font-weight: 900; }
  .kot-single-note  { font-size: 11px; font-style: italic; margin-top: 4px; }

  /* Footer */
  .kot-footer       { text-align: center; font-size: var(--kot-size-sm); padding: var(--kot-pad); opacity: .6; }
  .kot-copy-label   { text-align: center; font-size: 9px; letter-spacing: 2px; text-transform: uppercase; opacity: .4; margin-top: 4px; }
`;

// ─── Style injector (idempotent) ─────────────────────────────────────────────

function injectKotStyle() {
  if (document.getElementById('kot-style')) return;
  const el = document.createElement('style');
  el.id = 'kot-style';
  el.textContent = KOT_STYLE;
  document.head.appendChild(el);
}

// ─── Single ticket renderers ──────────────────────────────────────────────────

function ConsolidatedTicket({ order, kotNumber }) {
  const items = order.items ?? [];
  return (
    <div className="kot-ticket">
      {/* Header */}
      <div className="kot-header">
        <div className="kot-brand">{RESTAURANT_NAME}</div>
        <div className="kot-brand-sub">{RESTAURANT_LINE2}</div>
      </div>

      <div className="kot-type-banner kot-type-consolidated">
        ★ Kitchen Order Ticket ★
      </div>

      <hr className="kot-divider-solid" />

      {/* Meta */}
      <div className="kot-meta">
        <div className="kot-meta-left">
          <span className="kot-meta-label">KOT #</span>
          <span className="kot-meta-value-lg">{kotNumber}</span>
          <span className="kot-meta-label" style={{ marginTop: 4 }}>Captain</span>
          <span className="kot-meta-value">{order.captainName ?? '—'}</span>
        </div>
        <div className="kot-meta-right">
          <span className="kot-meta-label">Table / Type</span>
          <span className="kot-meta-value-lg">
            {order.tableNumber ? `T-${order.tableNumber}` : (order.serviceType ?? 'Takeaway')}
          </span>
          <span className="kot-meta-label" style={{ marginTop: 4 }}>Date &amp; Time</span>
          <span className="kot-meta-value">{nowIST()}</span>
        </div>
      </div>

      {order.tableSection && (
        <div style={{ textAlign: 'center', fontSize: 10, opacity: .6, marginBottom: 2 }}>
          Section: {order.tableSection}
        </div>
      )}

      <hr className="kot-divider" />

      {/* Items */}
      <table className="kot-items">
        <thead>
          <tr>
            <th className="kot-item-sno">#</th>
            <th style={{ textAlign: 'left' }}>Item</th>
            <th className="kot-item-qty">Qty</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.kdsId ?? idx}>
              <td className="kot-item-sno">{idx + 1}</td>
              <td>
                {item.name}
                {item.note && <span className="kot-item-note">⚠ {item.note}</span>}
              </td>
              <td className="kot-item-qty">{item.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr className="kot-divider-solid" />

      {/* Special instructions */}
      {order.specialNotes && (
        <div style={{ padding: '4px 10px', fontSize: 11, fontStyle: 'italic' }}>
          ⚠ Special: {order.specialNotes}
        </div>
      )}

      <div className="kot-copy-label">** Kitchen Copy **</div>
      <div className="kot-footer">Order #{String(order.orderNumber ?? '').slice(-6)}</div>
    </div>
  );
}

function IndividualTicket({ item, order, kotNumber, itemIndex, totalItems }) {
  return (
    <div className="kot-ticket">
      {/* Header */}
      <div className="kot-header">
        <div className="kot-brand">{RESTAURANT_NAME}</div>
        <div className="kot-brand-sub">{RESTAURANT_LINE2}</div>
      </div>

      <div className="kot-type-banner kot-type-individual">
        Item Ticket {itemIndex + 1} / {totalItems}
      </div>

      <hr className="kot-divider-solid" />

      {/* Meta */}
      <div className="kot-meta">
        <div className="kot-meta-left">
          <span className="kot-meta-label">KOT #</span>
          <span className="kot-meta-value-lg">{kotNumber}</span>
        </div>
        <div className="kot-meta-right">
          <span className="kot-meta-label">Table / Type</span>
          <span className="kot-meta-value-lg">
            {order.tableNumber ? `T-${order.tableNumber}` : (order.serviceType ?? 'Takeaway')}
          </span>
        </div>
      </div>

      <hr className="kot-divider" />

      {/* Single item — large, readable across the kitchen */}
      <div className="kot-single-item">
        <div className="kot-single-qty">× {item.qty}</div>
        <div>{item.name}</div>
        {item.note && <div className="kot-single-note">⚠ {item.note}</div>}
      </div>

      <hr className="kot-divider" />

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 10px', fontSize: 10, opacity: .6 }}>
        <span>{nowIST()}</span>
        <span>Captain: {order.captainName ?? '—'}</span>
      </div>

      <div className="kot-copy-label">** Kitchen Copy **</div>
      <div className="kot-footer">Order #{String(order.orderNumber ?? '').slice(-6)}</div>
    </div>
  );
}

function CancellationTicket({ order, kotNumber, itemsToCancelLabel }) {
  return (
    <div className="kot-ticket">
      {/* Header */}
      <div className="kot-header">
        <div className="kot-brand">{RESTAURANT_NAME}</div>
        <div className="kot-brand-sub">{RESTAURANT_LINE2}</div>
      </div>

      <div className="kot-type-banner kot-type-cancel">
        ✕ Cancellation Notice ✕
      </div>

      <hr className="kot-divider-solid" />

      <div className="kot-cancel-stamp">** CANCEL **</div>

      <div className="kot-meta">
        <div className="kot-meta-left">
          <span className="kot-meta-label">KOT #</span>
          <span className="kot-meta-value-lg">{kotNumber}</span>
          <span className="kot-meta-label" style={{ marginTop: 4 }}>Captain</span>
          <span className="kot-meta-value">{order.captainName ?? '—'}</span>
        </div>
        <div className="kot-meta-right">
          <span className="kot-meta-label">Table / Type</span>
          <span className="kot-meta-value-lg">
            {order.tableNumber ? `T-${order.tableNumber}` : (order.serviceType ?? 'Takeaway')}
          </span>
          <span className="kot-meta-label" style={{ marginTop: 4 }}>Time</span>
          <span className="kot-meta-value">{nowIST()}</span>
        </div>
      </div>

      <hr className="kot-divider" />

      <div style={{ padding: '6px 10px', fontSize: 12 }}>
        <strong>STOP PREPARING:</strong>
        <div style={{ marginTop: 4, fontStyle: 'italic' }}>{itemsToCancelLabel}</div>
      </div>

      <hr className="kot-divider-solid" />

      <div className="kot-cancel-stamp" style={{ fontSize: 14 }}>DO NOT SERVE</div>
      <div className="kot-copy-label">** Kitchen Copy **</div>
      <div className="kot-footer">Order #{String(order.orderNumber ?? '').slice(-6)}</div>
    </div>
  );
}

// ─── KOTPrintTemplate — forwardRef component, mount once near root ────────────
//
// The component is always mounted but invisible on screen.
// The ref exposes: { renderAndPrint(tickets) }
// where `tickets` is an array of React elements (ConsolidatedTicket etc.)
// We inject them into a portal-like hidden div and call window.print().

export const KOTPrintTemplate = forwardRef(function KOTPrintTemplate(_, ref) {
  const [tickets, setTickets] = useState([]);
  const pendingResolve = useRef(null);

  useImperativeHandle(ref, () => ({
    renderAndPrint(ticketElements) {
      return new Promise((resolve) => {
        injectKotStyle();
        pendingResolve.current = resolve;
        setTickets(ticketElements);
      });
    },
  }));

  // After tickets render, trigger print then clear
  React.useEffect(() => {
    if (tickets.length === 0) return;
    // Tiny delay so the DOM flushes before print dialog opens
    const t = setTimeout(() => {
      window.print();
      setTickets([]);
      if (pendingResolve.current) {
        pendingResolve.current();
        pendingResolve.current = null;
      }
    }, 120);
    return () => clearTimeout(t);
  }, [tickets]);

  if (tickets.length === 0) return null;

  return (
    // kot-print-root is the selector in @media print that hides everything else
    <div className="kot-print-root" style={{ position: 'fixed', top: 0, left: 0, zIndex: 99999 }}>
      <div className="kot-print-zone">
        {tickets}
      </div>
    </div>
  );
});

// ─── useKOTPrint hook ─────────────────────────────────────────────────────────
//
// Pass the ref you created for <KOTPrintTemplate ref={kotRef} />.
//
// Returns:
//   printConsolidated(order)   — one ticket listing all items
//   printIndividual(order)     — one ticket per item (station-style)
//   printCancellation(order, itemsToCancel?)
//                              — cancellation notice; itemsToCancel is an
//                                optional array of item names; defaults to "all items"

export function useKOTPrint(kotRef) {

  const printConsolidated = useCallback(async (order) => {
    if (!kotRef?.current) {
      console.warn('[KOT] KOTPrintTemplate ref not attached.');
      return;
    }
    const kotNumber = nextKotNumber();
    await kotRef.current.renderAndPrint([
      <ConsolidatedTicket key="kot" order={order} kotNumber={kotNumber} />,
    ]);
  }, [kotRef]);

  const printIndividual = useCallback(async (order) => {
    if (!kotRef?.current) {
      console.warn('[KOT] KOTPrintTemplate ref not attached.');
      return;
    }
    const kotNumber  = nextKotNumber();
    const items      = order.items ?? [];
    const tickets    = items.map((item, idx) => (
      <IndividualTicket
        key={item.kdsId ?? idx}
        item={item}
        order={order}
        kotNumber={kotNumber}
        itemIndex={idx}
        totalItems={items.length}
      />
    ));
    await kotRef.current.renderAndPrint(tickets);
  }, [kotRef]);

  const printCancellation = useCallback(async (order, itemsToCancel) => {
    if (!kotRef?.current) {
      console.warn('[KOT] KOTPrintTemplate ref not attached.');
      return;
    }
    const kotNumber = nextKotNumber();
    const label = itemsToCancel?.length
      ? itemsToCancel.join(', ')
      : 'All items in this order';
    await kotRef.current.renderAndPrint([
      <CancellationTicket
        key="cancel"
        order={order}
        kotNumber={kotNumber}
        itemsToCancelLabel={label}
      />,
    ]);
  }, [kotRef]);

  return { printConsolidated, printIndividual, printCancellation };
}

// ─── KOTPrintButton — drop-in UI for any screen ───────────────────────────────
//
// <KOTPrintButton kotRef={kotRef} order={order} />
//
// Shows three buttons: Consolidated KOT / Individual Items / Cancel KOT.
// Style it however you like — default is a compact button row.

export function KOTPrintButton({ kotRef, order, onAfterPrint }) {
  const { printConsolidated, printIndividual, printCancellation } = useKOTPrint(kotRef);
  const [busy, setBusy] = useState(false);

  const handle = async (fn) => {
    setBusy(true);
    try { await fn(); onAfterPrint?.(); }
    finally { setBusy(false); }
  };

  return (
    <div style={styles.row}>
      <button
        style={{ ...styles.btn, ...styles.btnPrimary }}
        disabled={busy}
        onClick={() => handle(() => printConsolidated(order))}
        title="Print one ticket listing all items"
      >
        🖨 KOT
      </button>

      <button
        style={{ ...styles.btn, ...styles.btnSecondary }}
        disabled={busy}
        onClick={() => handle(() => printIndividual(order))}
        title="Print one ticket per item (station mode)"
      >
        🖨 Per Item
      </button>

      <button
        style={{ ...styles.btn, ...styles.btnDanger }}
        disabled={busy}
        onClick={() => handle(() => printCancellation(order))}
        title="Print a cancellation notice"
      >
        ✕ Cancel KOT
      </button>
    </div>
  );
}

const styles = {
  row: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  btn: {
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    letterSpacing: '.03em',
    transition: 'opacity .15s',
  },
  btnPrimary: {
    background: '#1d4ed8',
    color: '#fff',
  },
  btnSecondary: {
    background: '#374151',
    color: '#e5e7eb',
  },
  btnDanger: {
    background: 'transparent',
    color: '#ef4444',
    border: '1px solid #ef444466',
  },
};

// ─── ORDER SHAPE (reference) ──────────────────────────────────────────────────
//
// The `order` object passed to all print functions should look like:
//
// {
//   orderNumber:  'ORD-2026-0042',   // string; last 6 chars shown on ticket
//   tableNumber:  7,                 // number | null
//   tableSection: 'Rooftop',         // string | null
//   serviceType:  'Dine-in',         // 'Dine-in' | 'Takeaway' | 'Delivery'
//   captainName:  'Arjun',           // string | null
//   specialNotes: 'No onion please', // string | null (order-level)
//   items: [
//     {
//       kdsId: 'uuid-...',
//       name:  'Chicken Biryani',
//       qty:   2,
//       note:  'Extra spicy',    // item-level instruction | null
//     },
//     ...
//   ],
// }
//
// Build this from your existing KDS group object like so:
//
//   function groupToOrder(group) {
//     return {
//       orderNumber:  group.orderNumber,
//       tableNumber:  group.tableNumber,
//       tableSection: group.tableSection,
//       serviceType:  group.serviceType,
//       captainName:  null,           // add from your auth/session if available
//       specialNotes: group.specialNotes,
//       items: group.items.map(i => ({
//         kdsId: i.kdsId,
//         name:  i.name,
//         qty:   i.qty,
//         note:  null,               // item-level note if your schema has it
//       })),
//     };
//   }

// ─── ESC/POS COMPANION (Node.js backend — optional) ──────────────────────────
//
// For unattended printing from the KDS tablet or backend, use this pattern
// instead of window.print(). Install: npm install node-escpos escpos-network
//
// File: src/server/kotEscPos.js
//
//   const escpos   = require('escpos');
//   const Network  = require('escpos-network');
//
//   const PRINTER_IP   = process.env.PRINTER_IP   || '192.168.1.100';
//   const PRINTER_PORT = process.env.PRINTER_PORT  || 9100;
//
//   async function printKotEscPos(order, mode = 'consolidated') {
//     const device  = new Network(PRINTER_IP, PRINTER_PORT);
//     const printer = new escpos.Printer(device);
//
//     await new Promise((res, rej) => device.open(e => e ? rej(e) : res()));
//
//     printer
//       .font('A').align('CT').style('B').size(1, 1)
//       .text('MUNAFE').style('NORMAL').size(0, 0)
//       .text('Kitchen Order Ticket').drawLine();
//
//     if (mode === 'consolidated') {
//       printer.align('LT');
//       (order.items ?? []).forEach((item, i) => {
//         printer.text(`${i + 1}. ${item.name.padEnd(24)} x${item.qty}`);
//         if (item.note) printer.text(`   > ${item.note}`);
//       });
//     } else {
//       // individual: cut and re-open per item
//       for (const item of (order.items ?? [])) {
//         printer.align('CT').style('B').size(2, 2).text(`x${item.qty}`)
//           .size(1, 1).text(item.name).style('NORMAL').size(0, 0);
//         if (item.note) printer.text(item.note);
//         printer.cut();
//       }
//     }
//
//     printer.cut().close();
//   }
//
//   module.exports = { printKotEscPos };
//
// Then call from your Express route:
//   router.post('/api/orders/:id/complete', async (req, res) => {
//     // ... mark items ready, send WhatsApp ...
//     await printKotEscPos(order, 'consolidated');  // auto-print on KDS tablet
//     res.json({ ok: true });
//   });














