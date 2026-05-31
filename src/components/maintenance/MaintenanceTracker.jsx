import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

// ── domain constants ──────────────────────────────────────────────────────────

const CATEGORIES = [
  'Plumbing', 'Electrical', 'Appliance', 'HVAC / Air Con',
  'Structural', 'Painting / Cosmetic', 'Furniture', 'Security',
  'Internet / Tech', 'Cleaning', 'Other',
]

const PRIORITIES = [
  { value: 'low',    label: 'Low',    cls: 'bg-gray-100 text-gray-600' },
  { value: 'medium', label: 'Medium', cls: 'bg-yellow-100 text-yellow-700' },
  { value: 'high',   label: 'High',   cls: 'bg-orange-100 text-orange-700' },
  { value: 'urgent', label: 'Urgent', cls: 'bg-red-100 text-red-700' },
]

const STATUSES = [
  { value: 'open',        label: 'Open',        cls: 'bg-blue-100 text-blue-700' },
  { value: 'in_progress', label: 'In Progress', cls: 'bg-purple-100 text-purple-700' },
  { value: 'scheduled',   label: 'Scheduled',   cls: 'bg-amber-100 text-amber-700' },
  { value: 'completed',   label: 'Completed',   cls: 'bg-green-100 text-green-700' },
  { value: 'cancelled',   label: 'Cancelled',   cls: 'bg-gray-100 text-gray-400' },
]

const today    = () => new Date().toISOString().slice(0, 10)
const usd      = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const fmtMoney = (v) => (v != null && v !== '') ? usd.format(v) : '—'
const num      = (v) => parseFloat(v) || 0

const EMPTY_FORM = {
  unit_id: '', date_reported: today(), category: '',
  issue_description: '', priority: 'medium', contractor: '',
  estimated_cost: '', actual_cost: '', status: 'open',
  date_completed: '', notes: '',
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition disabled:bg-gray-50'
const filterCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500'

// ── small helpers ─────────────────────────────────────────────────────────────

function Badge({ value, map }) {
  const e = map.find(x => x.value === value)
  if (!e) return <span className="text-gray-300 text-xs">—</span>
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${e.cls}`}>{e.label}</span>
}

function Field({ label, required, hint, span2, children }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

// ── modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const fn = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-14 bg-black/40 backdrop-blur-[1px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition text-sm"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

// ── add / edit form ───────────────────────────────────────────────────────────

function MaintenanceForm({ units, initial, onSave, onDelete, onCancel }) {
  const [form,          setForm]          = useState(initial ? { ...EMPTY_FORM, ...initial } : EMPTY_FORM)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isEdit = Boolean(initial?.id)

  function handle(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  function handleStatus(e) {
    const status = e.target.value
    setForm(prev => ({
      ...prev,
      status,
      date_completed: status === 'completed' && !prev.date_completed ? today() : prev.date_completed,
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      unit_id:           form.unit_id,
      date_reported:     form.date_reported,
      category:          form.category,
      issue_description: form.issue_description,
      priority:          form.priority,
      contractor:        form.contractor  || null,
      estimated_cost:    form.estimated_cost !== '' ? num(form.estimated_cost) : null,
      actual_cost:       form.actual_cost   !== '' ? num(form.actual_cost)    : null,
      status:            form.status,
      date_completed:    form.status === 'completed' && form.date_completed ? form.date_completed : null,
      notes:             form.notes || null,
    }

    const { error: err } = isEdit
      ? await supabase.from('maintenance').update(payload).eq('id', initial.id)
      : await supabase.from('maintenance').insert(payload)

    if (err) { setError(err.message); setLoading(false) }
    else onSave()
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setLoading(true)
    const { error: err } = await supabase.from('maintenance').delete().eq('id', initial.id)
    if (err) { setError(err.message); setLoading(false) }
    else onDelete()
  }

  const showResolution = form.status === 'completed' || form.status === 'in_progress' || form.status === 'scheduled'

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div className="mx-6 mt-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {/* Section: basics */}
      <div className="px-6 pt-5 pb-4 grid grid-cols-2 gap-4">
        <Field label="Unit" required>
          <select name="unit_id" value={form.unit_id} onChange={handle} required className={inputCls}>
            <option value="">Select unit…</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </Field>
        <Field label="Date reported" required>
          <input type="date" name="date_reported" value={form.date_reported} onChange={handle} required className={inputCls} />
        </Field>
        <Field label="Category" required>
          <select name="category" value={form.category} onChange={handle} required className={inputCls}>
            <option value="">Select category…</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Priority" required>
          <select name="priority" value={form.priority} onChange={handle} className={inputCls}>
            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Issue description" required span2>
          <textarea name="issue_description" value={form.issue_description} onChange={handle}
            required rows={3} placeholder="Describe the issue…"
            className={`${inputCls} resize-none`} />
        </Field>
      </div>

      {/* Section: assignment */}
      <div className="px-6 py-4 border-t border-gray-100 grid grid-cols-2 gap-4">
        <p className="col-span-2 text-xs font-semibold uppercase tracking-wider text-gray-400 -mb-1">
          Assignment &amp; Costs
        </p>
        <Field label="Contractor / Vendor">
          <input type="text" name="contractor" value={form.contractor} onChange={handle}
            placeholder="Name or company" className={inputCls} />
        </Field>
        <Field label="Estimated cost">
          <div className="relative">
            <span className="absolute left-3 top-2 text-gray-400 text-sm">₱</span>
            <input type="number" name="estimated_cost" value={form.estimated_cost} onChange={handle}
              min="0" step="0.01" placeholder="0.00" className={`${inputCls} pl-7`} />
          </div>
        </Field>
      </div>

      {/* Section: resolution */}
      <div className="px-6 py-4 border-t border-gray-100 grid grid-cols-2 gap-4">
        <p className="col-span-2 text-xs font-semibold uppercase tracking-wider text-gray-400 -mb-1">
          Resolution
        </p>
        <Field label="Status" required>
          <select name="status" value={form.status} onChange={handleStatus} className={inputCls}>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        {showResolution && (
          <Field label="Actual cost">
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400 text-sm">₱</span>
              <input type="number" name="actual_cost" value={form.actual_cost} onChange={handle}
                min="0" step="0.01" placeholder="0.00" className={`${inputCls} pl-7`} />
            </div>
          </Field>
        )}
        {form.status === 'completed' && (
          <Field label="Date completed">
            <input type="date" name="date_completed" value={form.date_completed} onChange={handle} className={inputCls} />
          </Field>
        )}
      </div>

      {/* Section: notes */}
      <div className="px-6 py-4 border-t border-gray-100">
        <Field label="Notes">
          <textarea name="notes" value={form.notes} onChange={handle} rows={2}
            placeholder="Vendor contact, follow-up actions, warranty info…"
            className={`${inputCls} resize-none`} />
        </Field>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex items-center justify-between shrink-0">
        <div>
          {isEdit && (
            <button type="button" onClick={handleDelete} disabled={loading}
              className={`text-sm font-medium transition ${
                confirmDelete ? 'text-red-600 hover:text-red-800' : 'text-gray-400 hover:text-red-500'
              }`}>
              {confirmDelete ? 'Tap again to confirm' : 'Delete item'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700 transition">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition">
            {loading ? 'Saving…' : isEdit ? 'Update' : 'Add Item'}
          </button>
        </div>
      </div>
    </form>
  )
}

// ── main tracker component ────────────────────────────────────────────────────

export default function MaintenanceTracker() {
  const [units,    setUnits]    = useState([])
  const [rows,     setRows]     = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  // filters
  const [unitId,  setUnitId]  = useState('')
  const [status,  setStatus]  = useState('')
  const [search,  setSearch]  = useState('')
  // modal
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editing,    setEditing]    = useState(null) // null = add, object = edit

  useEffect(() => {
    supabase.from('units').select('id, name').order('name').then(({ data }) => setUnits(data ?? []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let q = supabase
      .from('maintenance')
      .select('*, units(name)')
      .order('date_reported', { ascending: false })
      .order('created_at',    { ascending: false })
    if (unitId) q = q.eq('unit_id', unitId)
    if (status) q = q.eq('status', status)
    const { data, error: e } = await q
    if (e) setError(e.message)
    else setRows(data ?? [])
    setLoading(false)
  }, [unitId, status])

  useEffect(() => { load() }, [load])

  function openAdd() { setEditing(null); setModalOpen(true) }
  function openEdit(row) { setEditing(row); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setEditing(null) }

  function handleSaved() { closeModal(); load() }
  function handleDeleted() { closeModal(); load() }

  const filtered = search.trim()
    ? rows.filter(r => {
        const q = search.toLowerCase()
        return (
          r.issue_description?.toLowerCase().includes(q) ||
          r.category?.toLowerCase().includes(q) ||
          r.contractor?.toLowerCase().includes(q) ||
          r.units?.name?.toLowerCase().includes(q)
        )
      })
    : rows

  // Quick status counts for the summary bar
  const counts = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  const unitName = (row) => row.units?.name ?? '—'

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Maintenance Tracker</h2>
          <p className="text-sm text-gray-500 mt-0.5">Track repairs, contractors, and costs across all units</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition"
        >
          + Add Item
        </button>
      </div>

      {/* Status summary bar */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {STATUSES.map(s => counts[s.value] ? (
            <button
              key={s.value}
              onClick={() => setStatus(prev => prev === s.value ? '' : s.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                status === s.value
                  ? s.cls + ' border-current ring-1 ring-current'
                  : s.cls + ' border-transparent opacity-80 hover:opacity-100'
              }`}
            >
              {s.label}
              <span className="font-bold">{counts[s.value]}</span>
            </button>
          ) : null)}
          {status && (
            <button onClick={() => setStatus('')}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 transition">
              clear ✕
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Unit</p>
          <select value={unitId} onChange={e => setUnitId(e.target.value)} className={filterCls}>
            <option value="">All units</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Status</p>
          <select value={status} onChange={e => setStatus(e.target.value)} className={filterCls}>
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Search</p>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Issue, category, contractor…"
            className={`${filterCls} w-full`}
          />
        </div>
        {loading && <span className="text-sm text-gray-400 self-end pb-2">Loading…</span>}
        {!loading && (
          <span className="text-sm text-gray-400 self-end pb-2">
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Unit</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Reported</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Category</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Issue</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Contractor</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Est.</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Actual</th>
                <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Completed</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{unitName(row)}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap tabular-nums">{row.date_reported}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{row.category}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-[240px]">
                    <span title={row.issue_description} className="block truncate">
                      {row.issue_description}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <Badge value={row.priority} map={PRIORITIES} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {row.contractor ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 tabular-nums whitespace-nowrap">
                    {fmtMoney(row.estimated_cost)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums whitespace-nowrap font-medium ${
                    row.actual_cost != null
                      ? row.actual_cost > (row.estimated_cost ?? 0)
                        ? 'text-red-500'
                        : 'text-green-600'
                      : 'text-gray-300'
                  }`}>
                    {fmtMoney(row.actual_cost)}
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <Badge value={row.status} map={STATUSES} />
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap tabular-nums">
                    {row.date_completed ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(row)}
                      className="text-xs text-gray-400 hover:text-brand-600 opacity-0 group-hover:opacity-100 transition font-medium px-2 py-1 rounded hover:bg-brand-50"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-sm text-gray-400">
                    {rows.length === 0 ? 'No maintenance items yet. Add your first one.' : 'No items match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Edit — ${editing.units?.name ?? ''} · ${editing.category}` : 'Add Maintenance Item'}
      >
        <MaintenanceForm
          units={units}
          initial={editing}
          onSave={handleSaved}
          onDelete={handleDeleted}
          onCancel={closeModal}
        />
      </Modal>
    </div>
  )
}
