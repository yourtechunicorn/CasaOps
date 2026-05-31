import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const now = new Date()
const DEFAULT_FROM = `${now.getFullYear()}-01`
const DEFAULT_TO   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const num = (v) => parseFloat(v) || 0

// Handles: date '2026-01-01', short date '2026-01', yyyymm int 202601,
// or separate year (int) + month (int) columns on the same row.
function rowMonthKey(row) {
  if (!row) return ''
  const col = row.month ?? row.month_start ?? row.period ?? row.month_date
  if (col != null) {
    const s = String(col)
    if (s.includes('-')) return s.slice(0, 7)                      // date string
    if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4)}` // yyyymm integer
  }
  const yr = row.year ?? row.yr
  const mo = typeof row.month === 'number' ? row.month : (row.month_num ?? row.mo)
  if (yr && mo) return `${yr}-${String(mo).padStart(2, '0')}`
  return ''
}

function formatMonthLabel(yyyymm) {
  if (!yyyymm) return ''
  const [y, m] = yyyymm.split('-')
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

// Occupancy may come as 0-1 or 0-100 — normalise to 0-100
function normOcc(raw) {
  const n = num(raw)
  return n <= 1 ? n * 100 : n
}

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

// Date range is applied client-side — avoids the integer cast error when
// the view's month column is an int (e.g. yyyymm or separate year/month ints).
const filterQ = (q, unitId) => q.eq('unit_id', unitId)

const inputClass =
  'rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function UnitDashboard() {
  const [units,  setUnits]  = useState([])
  const [unitId, setUnitId] = useState('')
  const [from,   setFrom]   = useState(DEFAULT_FROM)
  const [to,     setTo]     = useState(DEFAULT_TO)
  const [pnl,    setPnl]    = useState([])
  const [occ,    setOcc]    = useState([])
  const [income, setIncome] = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    supabase.from('units').select('id, name').order('name').then(({ data }) => {
      const rows = data ?? []
      setUnits(rows)
      if (rows.length) setUnitId(rows[0].id)
    })
  }, [])

  useEffect(() => {
    if (!unitId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [
        { data: pnlData,    error: pnlErr },
        { data: occData  },
        { data: incData  },
      ] = await Promise.all([
        filterQ(supabase.from('v_monthly_pnl').select('*'),      unitId),
        filterQ(supabase.from('v_monthly_occupancy').select('*'), unitId),
        filterQ(supabase.from('v_monthly_income').select('*'),    unitId),
      ])

      if (cancelled) return
      if (pnlErr) setError(pnlErr.message)
      setPnl(pnlData    ?? [])
      setOcc(occData    ?? [])
      setIncome(incData ?? [])
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [unitId]) // date range filtered client-side — no refetch needed on from/to change

  // ── merge views into chart rows (client-side date filter) ────────────────
  const chartData = useMemo(() => {
    const inRange = (r) => { const mk = rowMonthKey(r); return mk >= from && mk <= to }
    const pnlIn = pnl.filter(inRange)
    const occIn = occ.filter(inRange)
    const months = new Set([...pnlIn.map(rowMonthKey), ...occIn.map(rowMonthKey)].filter(Boolean))
    return [...months].sort().map(m => {
      const p = pnlIn.find(r => rowMonthKey(r) === m) ?? {}
      const o = occIn.find(r => rowMonthKey(r) === m) ?? {}
      const inc  = num(p.total_income   ?? p.net_income   ?? p.gross_income ?? p.income)
      const exp  = num(p.total_expenses ?? p.expenses)
      const net  = num(p.net_profit     ?? p.profit       ?? (inc - exp))
      const occV = normOcc(o.occupancy_rate ?? o.occupancy_pct ?? o.occupancy)
      return { month: formatMonthLabel(m), income: inc, expenses: exp, netProfit: net, occupancy: occV }
    })
  }, [pnl, occ, from, to])

  // ── KPI aggregates (same client-side date filter) ────────────────────────
  const kpi = useMemo(() => {
    const inRange  = (r) => { const mk = rowMonthKey(r); return mk >= from && mk <= to }
    const pnlIn    = pnl.filter(inRange)
    const incomeIn = income.filter(inRange)
    const occIn    = occ.filter(inRange)

    const totalIncome   = pnlIn.reduce((s, r) => s + num(r.total_income   ?? r.net_income   ?? r.gross_income ?? r.income), 0)
    const totalExpenses = pnlIn.reduce((s, r) => s + num(r.total_expenses ?? r.expenses), 0)
    const netProfit     = pnlIn.reduce((s, r) => s + num(r.net_profit     ?? r.profit), 0) || (totalIncome - totalExpenses)

    const totalNights  = incomeIn.reduce((s, r) => s + num(r.nights_booked ?? r.total_nights ?? r.num_nights), 0)
    const totalGross   = incomeIn.reduce((s, r) => s + num(r.gross_amount  ?? r.total_gross  ?? r.total_revenue), 0)
    const totalNet     = incomeIn.reduce((s, r) => s + num(r.net_payout    ?? r.total_net    ?? r.net_revenue), 0)
    const viewGrossAdr = incomeIn.length ? num(incomeIn[0].gross_adr ?? incomeIn[0].avg_gross_adr) : 0
    const viewNetAdr   = incomeIn.length ? num(incomeIn[0].net_adr   ?? incomeIn[0].avg_net_adr)   : 0
    const grossAdr = viewGrossAdr || (totalNights > 0 ? totalGross / totalNights : 0)
    const netAdr   = viewNetAdr   || (totalNights > 0 ? totalNet   / totalNights : 0)

    const occRows = occIn.filter(r => r.occupancy_rate != null || r.occupancy_pct != null || r.occupancy != null)
    const avgOcc  = occRows.length ? occRows.reduce((s, r) => s + normOcc(r.occupancy_rate ?? r.occupancy_pct ?? r.occupancy), 0) / occRows.length : 0

    return { totalIncome, totalExpenses, netProfit, grossAdr, netAdr, avgOcc }
  }, [pnl, income, occ, from, to])

  const unitName = units.find(u => u.id === unitId)?.name ?? ''

  return (
    <div>
      {/* ── Header + filters ── */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Unit</p>
          <select value={unitId} onChange={e => setUnitId(e.target.value)} className={inputClass}>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">From</p>
          <input type="month" value={from} max={to} onChange={e => setFrom(e.target.value)} className={inputClass} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">To</p>
          <input type="month" value={to} min={from} onChange={e => setTo(e.target.value)} className={inputClass} />
        </div>
        {loading && <span className="text-sm text-gray-400 self-center">Loading…</span>}
      </div>

      {error && (
        <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <KpiCard label="Net Revenue"  value={usd.format(kpi.totalIncome)}   color="blue"   />
        <KpiCard label="Expenses"     value={usd.format(kpi.totalExpenses)} color="orange" />
        <KpiCard label="Net Profit"   value={usd.format(kpi.netProfit)}     color={kpi.netProfit >= 0 ? 'green' : 'red'} />
        <KpiCard label="Occupancy"    value={`${kpi.avgOcc.toFixed(1)}%`}   color="gray"   />
        <KpiCard label="Gross ADR"    value={usd.format(kpi.grossAdr)}      color="gray"   />
        <KpiCard label="Net ADR"      value={usd.format(kpi.netAdr)}        color="gray"   />
      </div>

      {/* ── Chart ── */}
      {!loading && chartData.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm mb-6">
          No data for this unit and date range.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-5">
            Monthly performance — {unitName}
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis
                yAxisId="money"
                tickFormatter={v => v >= 1000 ? `₱${(v / 1000).toFixed(0)}k` : `₱${v}`}
                tick={{ fontSize: 11 }}
                width={52}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tickFormatter={v => `${v}%`}
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                width={38}
              />
              <Tooltip
                formatter={(v, name) =>
                  name === 'Occupancy %' ? [`${v.toFixed(1)}%`, name] : [usd.format(v), name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="money" dataKey="income"    name="Income"      fill="#38bdf8" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="money" dataKey="expenses"  name="Expenses"    fill="#fb923c" radius={[3, 3, 0, 0]} />
              <Line yAxisId="money" type="monotone" dataKey="netProfit" name="Net Profit"
                stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3, fill: '#22c55e' }} />
              <Line yAxisId="pct" type="monotone" dataKey="occupancy" name="Occupancy %"
                stroke="#a855f7" strokeWidth={2} strokeDasharray="5 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Monthly breakdown table ── */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left   px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Month</th>
                <th className="text-right  px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Income</th>
                <th className="text-right  px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Expenses</th>
                <th className="text-right  px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Net Profit</th>
                <th className="text-right  px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Occupancy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {chartData.map(row => (
                <tr key={row.month} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-800">{row.month}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{usd.format(row.income)}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{usd.format(row.expenses)}</td>
                  <td className={`px-5 py-3 text-right font-semibold ${row.netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {usd.format(row.netProfit)}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-600">
                    {row.occupancy > 0 ? `${row.occupancy.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                <td className="px-5 py-3 text-gray-700">Total</td>
                <td className="px-5 py-3 text-right text-gray-800">{usd.format(kpi.totalIncome)}</td>
                <td className="px-5 py-3 text-right text-gray-800">{usd.format(kpi.totalExpenses)}</td>
                <td className={`px-5 py-3 text-right ${kpi.netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {usd.format(kpi.netProfit)}
                </td>
                <td className="px-5 py-3 text-right text-gray-800">
                  {kpi.avgOcc > 0 ? `${kpi.avgOcc.toFixed(1)}% avg` : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
