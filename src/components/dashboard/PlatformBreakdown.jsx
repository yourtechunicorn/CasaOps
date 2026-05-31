import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ── constants ────────────────────────────────────────────────────────────────

const COLORS = ['#38bdf8', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#eab308', '#14b8a6', '#f43f5e']

const nowD = new Date()
const DEFAULT_FROM = `${nowD.getFullYear()}-01`
const DEFAULT_TO   = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const num = (v) => parseFloat(v) || 0

const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500'

// ── month-key helper (handles integer yyyymm, ISO date, and year+month cols) ──

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

// ── helpers: try common column-name variants ──────────────────────────────────

const rowBookings = (r) => num(r.booking_count ?? r.total_bookings ?? r.bookings ?? r.num_bookings)
const rowNights   = (r) => num(r.total_nights  ?? r.nights         ?? r.num_nights)
const rowGross    = (r) => num(r.gross_revenue  ?? r.gross_amount   ?? r.total_gross  ?? r.income ?? r.gross)
const rowNet      = (r) => num(r.net_revenue    ?? r.net_payout     ?? r.total_net    ?? r.net)

// ── sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 leading-none">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-2 leading-none">{value}</p>
    </div>
  )
}

function PieLabel({ cx, cy, midAngle, outerRadius, percent, name }) {
  if (percent < 0.05) return null
  const RAD = Math.PI / 180
  const r = outerRadius + 22
  const x = cx + r * Math.cos(-midAngle * RAD)
  const y = cy + r * Math.sin(-midAngle * RAD)
  return (
    <text x={x} y={y} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central"
      style={{ fontSize: 11, fill: '#374151' }}>
      {name} {(percent * 100).toFixed(0)}%
    </text>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function PlatformBreakdown() {
  const [units,   setUnits]   = useState([])
  const [unitId,  setUnitId]  = useState('')  // '' = all units
  const [from,    setFrom]    = useState(DEFAULT_FROM)
  const [to,      setTo]      = useState(DEFAULT_TO)
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    supabase.from('units').select('id, name').order('name').then(({ data }) => setUnits(data ?? []))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      let q = supabase.from('v_platform_income').select('*')
      if (unitId) q = q.eq('unit_id', unitId)
      const { data, error: e } = await q

      if (cancelled) return
      if (e) setError(e.message)
      else setRows(data ?? [])
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [unitId])

  // ── aggregate rows by platform ────────────────────────────────────────────

  const platforms = useMemo(() => {
    const inRange = (r) => {
      const mk = rowMonthKey(r)
      if (!mk) return true
      return mk >= from && mk <= to
    }
    const map = {}
    rows.filter(inRange).forEach(r => {
      const key  = r.platform_id ?? r.platform_name ?? r.name ?? 'Unknown'
      const name = r.platform_name ?? r.name ?? 'Unknown'
      if (!map[key]) map[key] = { id: key, name, bookings: 0, nights: 0, gross: 0, net: 0 }
      map[key].bookings += rowBookings(r)
      map[key].nights   += rowNights(r)
      map[key].gross    += rowGross(r)
      map[key].net      += rowNet(r)
    })

    return Object.values(map)
      .filter(p => p.gross > 0 || p.bookings > 0)
      .sort((a, b) => b.gross - a.gross)
      .map((p, i) => ({
        ...p,
        color:    COLORS[i % COLORS.length],
        grossAdr: p.nights > 0 ? p.gross / p.nights : 0,
        netAdr:   p.nights > 0 ? p.net   / p.nights : 0,
      }))
  }, [rows, from, to])

  const totals = useMemo(() => ({
    platforms: platforms.length,
    bookings:  platforms.reduce((s, p) => s + p.bookings, 0),
    nights:    platforms.reduce((s, p) => s + p.nights, 0),
    gross:     platforms.reduce((s, p) => s + p.gross, 0),
    net:       platforms.reduce((s, p) => s + p.net, 0),
  }), [platforms])

  const pieData  = platforms.map(p => ({ name: p.name, value: p.gross, color: p.color }))
  const adrData  = platforms.map(p => ({
    name:     p.name.length > 12 ? p.name.slice(0, 11) + '…' : p.name,
    fullName: p.name,
    'Gross ADR': p.grossAdr,
    'Net ADR':   p.netAdr,
  }))

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header + filters */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Platform Breakdown</h2>
          <p className="text-sm text-gray-500">Revenue contribution and ADR by booking source</p>
        </div>
        <div className="flex flex-wrap items-end gap-3 ml-auto">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Unit</p>
            <select value={unitId} onChange={e => setUnitId(e.target.value)} className={inputCls}>
              <option value="">All units</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
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

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Active platforms" value={totals.platforms} />
        <KpiCard label="Total bookings"   value={totals.bookings || '—'} />
        <KpiCard label="Gross revenue"    value={usd.format(totals.gross)} />
        <KpiCard label="Net revenue"      value={usd.format(totals.net)} />
      </div>

      {/* Charts row */}
      {platforms.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">

          {/* Revenue share pie */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Gross revenue share</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  labelLine={false}
                  label={PieLabel}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [usd.format(v), 'Gross revenue']} />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value, entry) => (
                    <span style={{ color: entry.color }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* ADR comparison */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">ADR by platform</h3>
            <p className="text-xs text-gray-400 mb-4">Average daily rate — gross vs net per night booked</p>
            <ResponsiveContainer width="100%" height={248}>
              <BarChart data={adrData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis
                  tickFormatter={v => `₱${v}`}
                  tick={{ fontSize: 11 }}
                  width={46}
                />
                <Tooltip
                  formatter={(v, name) => [usd.format(v), name]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ''}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Gross ADR" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Net ADR"   fill="#22c55e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        !loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400 mb-6">
            No platform data for this filter selection.
          </div>
        )
      )}

      {/* Platform detail table */}
      {platforms.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Platform detail</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left  px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Platform</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Bookings</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Nights</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Gross Revenue</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Net Revenue</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Platform Fee</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Gross ADR</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Net ADR</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">% of Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {platforms.map(p => {
                  const fee     = p.gross - p.net
                  const feePct  = p.gross > 0 ? (fee / p.gross * 100) : 0
                  const sharePct = totals.gross > 0 ? (p.gross / totals.gross * 100) : 0
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                          <span className="font-medium text-gray-800">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{p.bookings || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{p.nights   || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{usd.format(p.gross)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{usd.format(p.net)}</td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {fee > 0 ? `${usd.format(fee)} (${feePct.toFixed(1)}%)` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{p.grossAdr > 0 ? usd.format(p.grossAdr) : '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{p.netAdr   > 0 ? usd.format(p.netAdr)   : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${sharePct}%`, background: p.color }} />
                          </div>
                          <span className="text-gray-600 text-xs w-8 text-right">{sharePct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {/* Totals row */}
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-5 py-3 text-gray-700">Total</td>
                  <td className="px-4 py-3 text-right text-gray-800">{totals.bookings || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-800">{totals.nights   || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-800">{usd.format(totals.gross)}</td>
                  <td className="px-4 py-3 text-right text-gray-800">{usd.format(totals.net)}</td>
                  <td className="px-4 py-3 text-right text-gray-600 text-xs">
                    {totals.gross - totals.net > 0
                      ? `${usd.format(totals.gross - totals.net)} (${((totals.gross - totals.net) / totals.gross * 100).toFixed(1)}%)`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-800">
                    {totals.nights > 0 ? usd.format(totals.gross / totals.nights) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-800">
                    {totals.nights > 0 ? usd.format(totals.net / totals.nights) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 text-xs">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
