import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import ExpenseForm from '../forms/ExpenseForm'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const num = (v) => parseFloat(v) || 0

const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500'

const TYPE_BADGE = {
  recurring:   'bg-sky-100 text-sky-700',
  variable:    'bg-purple-100 text-purple-700',
  maintenance: 'bg-orange-100 text-orange-700',
}

function SortTh({ label, k, right, sortKey, sortDir, onSort }) {
  const active = sortKey === k
  return (
    <th
      onClick={() => onSort(k)}
      className={`${right ? 'text-right' : 'text-left'} px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 cursor-pointer select-none hover:text-gray-600 transition-colors whitespace-nowrap`}
    >
      {label}{active ? (sortDir === -1 ? ' ↓' : ' ↑') : ''}
    </th>
  )
}

export default function ExpensesList() {
  const [units,      setUnits]      = useState([])
  const [categories, setCategories] = useState([])
  const [rows,       setRows]       = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // server-side filters
  const [unitId,       setUnitId]       = useState('')
  const [categorySlug, setCategorySlug] = useState('')
  const [type,       setType]       = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [paidFilter, setPaidFilter] = useState('')  // '' | 'paid' | 'unpaid'

  // sort
  const [sortKey, setSortKey] = useState('expense_date')
  const [sortDir, setSortDir] = useState(-1)

  // edit / delete
  const [editRow,    setEditRow]    = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('units').select('id, name').order('name'),
      supabase.from('expense_categories').select('slug, label').order('label'),
    ]).then(([{ data: u }, { data: c }]) => {
      setUnits(u ?? [])
      setCategories(c ?? [])
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      let q = supabase
        .from('expenses')
        .select('id, unit_id, category_slug, expense_type, description, amount, expense_date, is_paid, paid_date, notes, units(name)')
        .order('expense_date', { ascending: false })
        .limit(500)

      if (unitId)       q = q.eq('unit_id', unitId)
      if (categorySlug) q = q.eq('category_slug', categorySlug)
      if (type)         q = q.eq('expense_type', type)
      if (dateFrom)   q = q.gte('expense_date', dateFrom)
      if (dateTo)     q = q.lte('expense_date', dateTo)
      if (paidFilter === 'paid')   q = q.eq('is_paid', true)
      if (paidFilter === 'unpaid') q = q.eq('is_paid', false)

      const { data, error: e } = await q
      if (cancelled) return
      if (e) setError(e.message)
      else setRows(data ?? [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [unitId, categorySlug, type, dateFrom, dateTo, paidFilter, refreshKey])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      if (sortKey === 'amount') return sortDir * (num(bv) - num(av))
      if (sortKey === 'unit')   return sortDir * String(a.units?.name ?? '').localeCompare(String(b.units?.name ?? ''))
      if (sortKey === 'category') return sortDir * String(categories.find(c => c.slug === a.category_slug)?.label ?? '').localeCompare(String(categories.find(c => c.slug === b.category_slug)?.label ?? ''))
      return sortDir * String(av).localeCompare(String(bv))
    })
  }, [rows, sortKey, sortDir])

  const totals = useMemo(() => ({
    all:    rows.reduce((s, r) => s + num(r.amount), 0),
    unpaid: rows.filter(r => !r.is_paid).reduce((s, r) => s + num(r.amount), 0),
  }), [rows])

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(-1) }
  }

  async function handleDelete(id) {
    if (deletingId !== id) { setDeletingId(id); return }
    const { error: e } = await supabase.from('expenses').delete().eq('id', id)
    if (e) { setError(e.message); setDeletingId(null); return }
    setRows(prev => prev.filter(r => r.id !== id))
    setDeletingId(null)
  }

  async function togglePaid(row) {
    const newPaid = !row.is_paid
    const update  = {
      is_paid:   newPaid,
      paid_date: newPaid ? (row.paid_date || new Date().toISOString().slice(0, 10)) : null,
    }
    const { error: e } = await supabase.from('expenses').update(update).eq('id', row.id)
    if (e) { setError(e.message); return }
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...update } : r))
  }

  const sp = { sortKey, sortDir, onSort: handleSort }

  return (
    <div>
      {/* Summary strip */}
      {!loading && rows.length > 0 && (
        <div className="flex gap-4 mb-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm">
            <span className="text-gray-500">Total: </span>
            <span className="font-semibold text-gray-800">{usd.format(totals.all)}</span>
            <span className="text-gray-400 ml-2">({rows.length} rows)</span>
          </div>
          {totals.unpaid > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm">
              <span className="text-red-500">Unpaid: </span>
              <span className="font-semibold text-red-700">{usd.format(totals.unpaid)}</span>
            </div>
          )}
        </div>
      )}

      {/* Filters row 1 — dropdowns */}
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Unit</p>
          <select value={unitId} onChange={e => setUnitId(e.target.value)} className={inputCls}>
            <option value="">All units</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Category</p>
          <select value={categorySlug} onChange={e => setCategorySlug(e.target.value)} className={inputCls}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Type</p>
          <select value={type} onChange={e => setType(e.target.value)} className={inputCls}>
            <option value="">All types</option>
            <option value="recurring">Recurring</option>
            <option value="variable">Variable</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Paid status</p>
          <select value={paidFilter} onChange={e => setPaidFilter(e.target.value)} className={inputCls}>
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>
      </div>

      {/* Filters row 2 — date range */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Date from</p>
          <input type="date" value={dateFrom} max={dateTo || undefined}
            onChange={e => setDateFrom(e.target.value)} className={inputCls} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Date to</p>
          <input type="date" value={dateTo} min={dateFrom || undefined}
            onChange={e => setDateTo(e.target.value)} className={inputCls} />
        </div>
        {loading && <span className="text-sm text-gray-400 self-end pb-2">Loading…</span>}
        {!loading && rows.length > 0 && (
          <span className="text-sm text-gray-400 self-end pb-2">
            {sorted.length} expense{sorted.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <SortTh label="Date"        k="expense_date" {...sp} />
                <SortTh label="Unit"        k="unit"         {...sp} />
                <SortTh label="Category"    k="category"     {...sp} />
                <SortTh label="Type"        k="type"         {...sp} />
                <SortTh label="Description" k="description"  {...sp} />
                <SortTh label="Amount"      k="amount"       right {...sp} />
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Paid</th>
                <th className="text-left   px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Payment date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(r => {
                const isDeleting = deletingId === r.id
                return (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 tabular-nums whitespace-nowrap">{r.expense_date}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.units?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{categories.find(c => c.slug === r.category_slug)?.label ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_BADGE[r.expense_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.expense_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-800 max-w-[220px] truncate" title={r.description}>{r.description}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800 tabular-nums">{usd.format(r.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => togglePaid(r)}
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                          r.is_paid
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {r.is_paid ? 'Paid' : 'Unpaid'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs tabular-nums whitespace-nowrap">
                      {r.paid_date ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 justify-end">
                        <button
                          onClick={() => { setEditRow(r); setDeletingId(null) }}
                          className="text-xs text-brand-600 hover:text-brand-800 font-medium transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          onBlur={() => { if (deletingId === r.id) setTimeout(() => setDeletingId(null), 150) }}
                          className={`text-xs font-medium transition-colors ${isDeleting ? 'text-red-600 font-semibold' : 'text-gray-400 hover:text-red-500'}`}
                        >
                          {isDeleting ? 'Confirm?' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">
                    No expenses found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editRow && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setEditRow(null) }}
        >
          <div className="my-8 w-full max-w-2xl">
            <ExpenseForm
              editData={editRow}
              onSuccess={() => { setEditRow(null); setRefreshKey(k => k + 1) }}
              onCancel={() => setEditRow(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
