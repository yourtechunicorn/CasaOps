import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  ResponsiveContainer, BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import GuestOrigins from './GuestOrigins'

// ── constants ───────────────────────────────────────────────────────────────

const COLORS = ['#38bdf8', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#eab308', '#14b8a6']

const nowD = new Date()
const DEFAULT_FROM = `${nowD.getFullYear()}-01`
const DEFAULT_TO   = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`

const usd  = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const num  = (v) => parseFloat(v) || 0
const normOcc = (raw) => { const n = num(raw); return n <= 1 ? n * 100 : n }

// Handles: date '2026-01-01', short date '2026-01', yyyymm int 202601,
// or separate year (int) + month (int) columns on the same row.
function rowMonthKey(row) {
  if (!row) return ''
  const col = row.month ?? row.month_start ?? row.period ?? row.month_date
  if (col != null) {
    const s = String(col)
    if (s.includes('-')) return s.slice(0, 7)
    if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4)}`
  }
  const yr = row.year ?? row.yr
  const mo = typeof row.month === 'number' ? row.month : (row.month_num ?? row.mo)
  if (yr && mo) return `${yr}-${String(mo).padStart(2, '0')}`
  return ''
}

function fmtMonth(yyyymm) {
  const [y, m] = String(yyyymm).split('-')
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

// ── shared helpers ───────────────────────────────────────────────────────────

const pnlIncome   = (r) => num(r.total_income   ?? r.net_income   ?? r.gross_income ?? r.income)
const pnlExpenses = (r) => num(r.total_expenses ?? r.expenses)
const pnlProfit   = (r) => num(r.net_profit     ?? r.profit)
const incNights   = (r) => num(r.nights_booked  ?? r.total_nights  ?? r.num_nights)
const incGross    = (r) => num(r.gross_amount    ?? r.total_gross   ?? r.total_revenue)
const incNet      = (r) => num(r.net_payout      ?? r.total_net     ?? r.net_revenue)
const occVal      = (r) => normOcc(r.occupancy_rate ?? r.occupancy_pct ?? r.occupancy)

const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500'

// ── sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, color }) {
  const ring = {
    blue:   'border-sky-200   bg-sky-50   text-sky-700',
    green:  'border-green-200 bg-green-50 text-green-700',
    red:    'border-red-200   bg-red-50   text-red-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    gray:   'border-gray-200  bg-gray-50  text-gray-700',
  }[color] ?? 'border-gray-200 bg-gray-50 text-gray-700'
  return (
    <div className={`rounded-xl border p-4 ${ring}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-60 leading-none">{label}</p>
      <p className="text-2xl font-bold mt-2 leading-none">{value}</p>
    </div>
  )
}

// Custom tooltip for the monthly stacked chart
function MonthlyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + num(p.value), 0)
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs min-w-[140px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex justify-between gap-4 py-0.5">
          <span style={{ color: p.fill }}>{p.dataKey}</span>
          <span className="font-medium text-gray-800">{usd.format(p.value)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 pt-1.5 mt-1 border-t border-gray-100 font-semibold text-gray-800">
        <span>Total</span>
        <span>{usd.format(total)}</span>
      </div>
    </div>
  )
}

// ── main component ───────────────────────────────────────────────────────────

export default function AllUnitsDashboard() {
  const [units,   setUnits]   = useState([])
  const [from,    setFrom]    = useState(DEFAULT_FROM)
  const [to,      setTo]      = useState(DEFAULT_TO)
  const [pnl,     setPnl]     = useState([])
  const [occ,     setOcc]     = useState([])
  const [income,  setIncome]  = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [sortKey, setSortKey] = useState('netProfit')
  const [sortDir, setSortDir] = useState(-1) // -1 desc, 1 asc

  useEffect(() => {
    supabase.from('units').select('id, name').order('name').then(({ data }) => setUnits(data ?? []))
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const base = (view) => supabase.from(view).select('*')

      const [{ data: p, error: e }, { data: o }, { data: i }] = await Promise.all([
        base('v_monthly_pnl'),
        base('v_monthly_occupancy'),
        base('v_monthly_income'),
      ])
      if (cancelled) return
      if (e) setError(e.message)
      setPnl(p    ?? [])
      setOcc(o    ?? [])
      setIncome(i ?? [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, []) // date range filtered client-side — avoids integer cast error on month column

  // ── per-unit stats ───────────────────────────────────────────────────────

  const unitStats = useMemo(() => {
    const inRange = (r) => { const mk = rowMonthKey(r); return mk >= from && mk <= to }
    return units.map((unit, idx) => {
      const pr = pnl.filter(r => r.unit_id === unit.id && inRange(r))
      const or = occ.filter(r => r.unit_id === unit.id && inRange(r))
      const ir = income.filter(r => r.unit_id === unit.id && inRange(r))

      const totalIncome   = pr.reduce((s, r) => s + pnlIncome(r), 0)
      const totalExpenses = pr.reduce((s, r) => s + pnlExpenses(r), 0)
      const rawProfit     = pr.reduce((s, r) => s + pnlProfit(r), 0)
      const netProfit     = rawProfit || (totalIncome - totalExpenses)

      const nights  = ir.reduce((s, r) => s + incNights(r), 0)
      const gross   = ir.reduce((s, r) => s + incGross(r), 0)
      const net     = ir.reduce((s, r) => s + incNet(r), 0)
      const grossAdr = nights > 0 ? gross / nights : 0
      const netAdr   = nights > 0 ? net   / nights : 0

      const occActive = or.filter(r => r.occupancy_rate != null || r.occupancy_pct != null || r.occupancy != null)
      const avgOcc    = occActive.length ? occActive.reduce((s, r) => s + occVal(r), 0) / occActive.length : 0

      return {
        id: unit.id, name: unit.name,
        color: COLORS[idx % COLORS.length],
        totalIncome, totalExpenses, netProfit, grossAdr, netAdr, avgOcc, nights,
      }
    })
  }, [units, pnl, occ, income, from, to])

  // ── portfolio grand totals ───────────────────────────────────────────────

  const grand = useMemo(() => {
    const inRange       = (r) => { const mk = rowMonthKey(r); return mk >= from && mk <= to }
    const incIn         = income.filter(inRange)
    const pnlIn         = pnl.filter(inRange)
    const totalIncome   = incIn.reduce((s, r) => s + incGross(r), 0)
    const totalExpenses = pnlIn.reduce((s, r) => s + pnlExpenses(r), 0)
    const netProfit     = pnlIn.reduce((s, r) => s + pnlProfit(r), 0) || (totalIncome - totalExpenses)
    const nights        = incIn.reduce((s, r) => s + incNights(r), 0)
    const grossTotal    = incIn.reduce((s, r) => s + incGross(r), 0)
    const netTotal      = incIn.reduce((s, r) => s + incNet(r), 0)
    const grossAdr      = nights > 0 ? grossTotal / nights : 0
    const netAdr        = nights > 0 ? netTotal   / nights : 0
    const occUnits      = unitStats.filter(u => u.avgOcc > 0)
    const avgOcc        = occUnits.length ? occUnits.reduce((s, u) => s + u.avgOcc, 0) / occUnits.length : 0
    return { totalIncome, totalExpenses, netProfit, grossAdr, netAdr, avgOcc }
  }, [pnl, income, unitStats, from, to])

  // ── monthly stacked income chart ─────────────────────────────────────────

  const monthlyData = useMemo(() => {
    const inRange = (r) => { const mk = rowMonthKey(r); return mk >= from && mk <= to }
    const pnlIn   = pnl.filter(inRange)
    const months  = new Set(pnlIn.map(rowMonthKey).filter(Boolean))
    return [...months].sort().map(m => {
      const row = { month: fmtMonth(m) }
      units.forEach(u => {
        const r = pnlIn.find(x => x.unit_id === u.id && rowMonthKey(x) === m) ?? {}
        row[u.name] = pnlIncome(r)
      })
      return row
    })
  }, [pnl, units, from, to])

  // ── unit comparison chart (totals, one group per unit) ───────────────────

  const compData = useMemo(() =>
    [...unitStats]
      .sort((a, b) => (b.totalIncome - a.totalIncome))
      .map(u => ({
        name:        u.name.length > 12 ? u.name.slice(0, 11) + '…' : u.name,
        fullName:    u.name,
        Income:      u.totalIncome,
        Expenses:    u.totalExpenses,
        'Net Profit': u.netProfit,
      }))
  , [unitStats])

  // ── sorted comparison table ──────────────────────────────────────────────

  const sortedStats = useMemo(() => {
    const cols = { totalIncome: 1, totalExpenses: 1, netProfit: 1, grossAdr: 1, netAdr: 1, avgOcc: 1, nights: 1 }
    if (!cols[sortKey]) return unitStats
    return [...unitStats].sort((a, b) => sortDir * (b[sortKey] - a[sortKey]))
  }, [unitStats, sortKey, sortDir])

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(-1) }
  }

  function SortTh({ label, k }) {
    const active = sortKey === k
    return (
      <th
        className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 cursor-pointer select-none hover:text-gray-600 transition-colors"
        onClick={() => handleSort(k)}
      >
        {label} {active ? (sortDir === -1 ? '↓' : '↑') : ''}
      </th>
    )
  }

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header + filters */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Portfolio Overview</h2>
          <p className="text-sm text-gray-500">All {units.length} units · aggregated</p>
        </div>
        <div className="flex flex-wrap items-end gap-3 ml-auto">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">From</p>
            <input type="month" value={from} max={to} onChange={e => setFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">To</p>
            <input type="month" value={to} min={from} onChange={e => setTo(e.target.value)} className={inputCls} />
          </div>
        </div>
        {loading && <span className="text-sm text-gray-400 self-end pb-2">Loading…</span>}
      </div>

      {error && (
        <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {/* Grand total KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <KpiCard label="Portfolio Revenue"  value={usd.format(grand.totalIncome)}   color="blue"   />
        <KpiCard label="Total Expenses"     value={usd.format(grand.totalExpenses)} color="orange" />
        <KpiCard label="Net Profit"         value={usd.format(grand.netProfit)}     color={grand.netProfit >= 0 ? 'green' : 'red'} />
        <KpiCard label="Avg Occupancy"      value={`${grand.avgOcc.toFixed(1)}%`}   color="gray"   />
        <KpiCard label="Portfolio Gross ADR" value={usd.format(grand.grossAdr)}     color="gray"   />
        <KpiCard label="Portfolio Net ADR"  value={usd.format(grand.netAdr)}        color="gray"   />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">

        {/* Monthly stacked income by unit */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-5">Monthly income by unit</h3>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`} tick={{ fontSize: 10 }} width={46} />
                <Tooltip content={<MonthlyTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {units.map((u, i) => (
                  <Bar key={u.id} dataKey={u.name} stackId="a"
                    fill={COLORS[i % COLORS.length]}
                    radius={i === units.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">No data</div>
          )}
        </div>

        {/* Unit income vs expenses comparison */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-5">Income vs expenses by unit</h3>
          {compData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={compData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`} tick={{ fontSize: 10 }} width={46} />
                <Tooltip
                  formatter={(v, name) => [usd.format(v), name]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Income"     fill="#38bdf8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Expenses"   fill="#fb923c" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Net Profit" fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">No data</div>
          )}
        </div>
      </div>

      {/* ── Unit comparison table ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">Unit comparison</h3>
          <span className="text-xs text-gray-400">— click a column header to sort</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Unit</th>
                <SortTh label="Revenue"  k="totalIncome"   />
                <SortTh label="Expenses" k="totalExpenses" />
                <SortTh label="Profit"   k="netProfit"     />
                <SortTh label="Occ %"    k="avgOcc"        />
                <SortTh label="Gross ADR" k="grossAdr"     />
                <SortTh label="Net ADR"  k="netAdr"        />
                <SortTh label="Nights"   k="nights"        />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedStats.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: u.color }} />
                      <span className="font-medium text-gray-800">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{usd.format(u.totalIncome)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{usd.format(u.totalExpenses)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${u.netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {usd.format(u.netProfit)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {u.avgOcc > 0 ? `${u.avgOcc.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{u.grossAdr > 0 ? usd.format(u.grossAdr) : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{u.netAdr   > 0 ? usd.format(u.netAdr)   : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{u.nights > 0 ? u.nights : '—'}</td>
                </tr>
              ))}

              {/* Portfolio totals row */}
              {sortedStats.length > 0 && (
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-5 py-3 text-gray-700">Portfolio total</td>
                  <td className="px-4 py-3 text-right text-gray-800">{usd.format(grand.totalIncome)}</td>
                  <td className="px-4 py-3 text-right text-gray-800">{usd.format(grand.totalExpenses)}</td>
                  <td className={`px-4 py-3 text-right ${grand.netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {usd.format(grand.netProfit)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-800">
                    {grand.avgOcc > 0 ? `${grand.avgOcc.toFixed(1)}% avg` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-800">{grand.grossAdr > 0 ? usd.format(grand.grossAdr) : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-800">{grand.netAdr   > 0 ? usd.format(grand.netAdr)   : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {unitStats.reduce((s, u) => s + u.nights, 0) || '—'}
                  </td>
                </tr>
              )}

              {!loading && sortedStats.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                    No data for this date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Guest origins — shares the same date range filter */}
      <GuestOrigins from={from} to={to} />
    </div>
  )
}
