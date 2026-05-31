import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { countryName, countryFlag } from '../../data/countries'
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

const DOMESTIC_CODE = 'PH'
const DOMESTIC_COLOR = '#22c55e'
const INTL_COLOR     = '#38bdf8'
const BAR_COLORS     = ['#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e', '#164e63', '#155e75', '#1e3a5f', '#1e3a8a']

const num = (v) => parseFloat(v) || 0

// Converts YYYY-MM to last day of that month as YYYY-MM-DD
function monthEnd(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number)
  return new Date(y, m, 0).toISOString().slice(0, 10)
}

function CustomPieLabel({ cx, cy, midAngle, outerRadius, percent, name }) {
  if (percent < 0.08) return null
  const RAD = Math.PI / 180
  const r = outerRadius * 0.65
  const x = cx + r * Math.cos(-midAngle * RAD)
  const y = cy + r * Math.sin(-midAngle * RAD)
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 13, fontWeight: 600, fill: '#fff' }}>
      {(percent * 100).toFixed(0)}%
    </text>
  )
}

export default function GuestOrigins({ from, to }) {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!from || !to) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const { data, error: e } = await supabase
        .from('bookings')
        .select('guest_country')
        .not('guest_country', 'is', null)
        .neq('status', 'cancelled')
        .gte('check_in_date', from + '-01')
        .lte('check_in_date', monthEnd(to))
      if (cancelled) return
      if (e) setError(e.message)
      else setRows(data ?? [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [from, to])

  // ── aggregations ──────────────────────────────────────────────────────────

  const { domestic, international, byCountry } = useMemo(() => {
    let domestic = 0, international = 0
    const map = {}
    rows.forEach(r => {
      const code = r.guest_country
      if (code === DOMESTIC_CODE) domestic++
      else international++
      map[code] = (map[code] ?? 0) + 1
    })
    const byCountry = Object.entries(map)
      .map(([code, count]) => ({ code, name: countryName(code), count, flag: countryFlag(code) }))
      .sort((a, b) => b.count - a.count)
    return { domestic, international, byCountry }
  }, [rows])

  const total = domestic + international

  const pieData = [
    { name: 'Domestic (PH)', value: domestic, color: DOMESTIC_COLOR },
    { name: 'International', value: international, color: INTL_COLOR },
  ].filter(d => d.value > 0)

  const topCountries = byCountry.slice(0, 10).map((c, i) => ({
    ...c,
    color: c.code === DOMESTIC_CODE ? DOMESTIC_COLOR : BAR_COLORS[i % BAR_COLORS.length],
    label: `${c.flag} ${c.name}`,
  }))

  if (!loading && total === 0 && !error) return null

  return (
    <div className="mt-6">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-base font-semibold text-gray-800">Guest Origins</h3>
        {!loading && total > 0 && (
          <span className="text-xs text-gray-400">{total} booking{total !== 1 ? 's' : ''} with country data</span>
        )}
        {loading && <span className="text-xs text-gray-400">Loading…</span>}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 mb-4">{error}</div>
      )}

      {total > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* Domestic vs International donut */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h4 className="text-sm font-semibold text-gray-700 mb-1">Domestic vs International</h4>
            <p className="text-xs text-gray-400 mb-4">Domestic = Philippines (PH)</p>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    dataKey="value"
                    labelLine={false}
                    label={CustomPieLabel}
                  >
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v, name) => [`${v} (${(v / total * 100).toFixed(1)}%)`, name]} />
                </PieChart>
              </ResponsiveContainer>

              {/* Legend + stats */}
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: DOMESTIC_COLOR }} />
                  <div>
                    <p className="text-sm font-medium text-gray-800">Domestic</p>
                    <p className="text-xl font-bold text-gray-900">{domestic}</p>
                    <p className="text-xs text-gray-400">{total > 0 ? `${(domestic / total * 100).toFixed(1)}%` : '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: INTL_COLOR }} />
                  <div>
                    <p className="text-sm font-medium text-gray-800">International</p>
                    <p className="text-xl font-bold text-gray-900">{international}</p>
                    <p className="text-xs text-gray-400">{total > 0 ? `${(international / total * 100).toFixed(1)}%` : '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Top countries horizontal bar */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h4 className="text-sm font-semibold text-gray-700 mb-5">Top countries by bookings</h4>
            {topCountries.length > 0 ? (
              <div className="space-y-2.5">
                {topCountries.map(c => {
                  const pct = total > 0 ? c.count / total * 100 : 0
                  return (
                    <div key={c.code} className="flex items-center gap-3">
                      <span className="text-base leading-none w-6 text-center">{c.flag}</span>
                      <span className="w-28 text-xs text-gray-600 truncate shrink-0">{c.name}</span>
                      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: c.color }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 w-6 text-right tabular-nums">{c.count}</span>
                      <span className="text-xs text-gray-400 w-9 text-right tabular-nums">{pct.toFixed(0)}%</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No country data yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
