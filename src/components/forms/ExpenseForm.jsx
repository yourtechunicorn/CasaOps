import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const EXPENSE_TYPES = [
  { value: 'recurring',   label: 'Recurring',   hint: 'Rent, insurance, subscriptions' },
  { value: 'variable',    label: 'Variable',    hint: 'Utilities, supplies, commissions' },
  { value: 'maintenance', label: 'Maintenance', hint: 'Repairs, replacements, upgrades' },
]

const today = () => new Date().toISOString().slice(0, 10)

function formFromData(e) {
  return {
    unit_id:       String(e.unit_id ?? ''),
    category_slug: String(e.category_slug ?? ''),
    template_id:   '',
    expense_type:  e.expense_type ?? 'recurring',
    description:   e.description ?? '',
    amount:        String(e.amount ?? ''),
    expense_date:  e.expense_date ?? today(),
    is_paid:       e.is_paid ?? false,
    paid_date:     e.paid_date ?? '',
    notes:         e.notes ?? '',
  }
}

const EMPTY_FORM = {
  unit_id:       '',
  category_slug: '',
  template_id:   '',
  expense_type:  'recurring',
  description:   '',
  amount:        '',
  expense_date:  today(),
  is_paid:       false,
  paid_date:     '',
  notes:         '',
}

function Field({ label, required, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${
        checked ? 'bg-green-500' : 'bg-gray-200'
      }`}
    >
      <span className="sr-only">{label}</span>
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

const inputClass =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition disabled:bg-gray-50 disabled:text-gray-500'

export default function ExpenseForm({ onSuccess, editData = null, onCancel }) {
  const [units, setUnits] = useState([])
  const [categories, setCategories] = useState([])
  const [templates, setTemplates] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    async function fetchLookups() {
      const [{ data: u }, { data: c }, { data: t }] = await Promise.all([
        supabase.from('units').select('id, name').order('name'),
        supabase.from('expense_categories').select('slug, label').order('label'),
        supabase.from('expense_templates').select('*').order('name'),
      ])
      setUnits(u ?? [])
      setCategories(c ?? [])
      setTemplates(t ?? [])
    }
    fetchLookups()
  }, [])

  useEffect(() => {
    setForm(editData ? formFromData(editData) : EMPTY_FORM)
    setSuccess(false)
    setSubmitError(null)
  }, [editData])

  function handle(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  function handleToggle(val) {
    setForm(prev => ({
      ...prev,
      is_paid:   val,
      paid_date: val ? today() : '',
    }))
  }

  function handleTypeClick(expense_type) {
    setForm(prev => ({ ...prev, expense_type, template_id: '' }))
  }

  function handleTemplateChange(e) {
    const templateId = e.target.value
    if (!templateId) {
      setForm(prev => ({ ...prev, template_id: '' }))
      return
    }
    const tpl = templates.find(t => t.id === templateId)
    if (!tpl) return
    setForm(prev => ({
      ...prev,
      template_id:   templateId,
      category_slug: tpl.category_slug ?? prev.category_slug,
      expense_type:  tpl.expense_type ?? prev.expense_type,
      description:   tpl.description ?? tpl.name ?? prev.description,
      amount:        tpl.amount != null ? String(tpl.amount) : prev.amount,
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setSubmitError(null)

    const payload = {
      unit_id:       form.unit_id,
      category_slug: form.category_slug || null,
      template_id:   form.template_id || null,
      expense_type:  form.expense_type,
      description:   form.description,
      amount:        parseFloat(form.amount),
      expense_date:  form.expense_date,
      is_paid:       form.is_paid,
      paid_date:     form.is_paid && form.paid_date ? form.paid_date : null,
      notes:         form.notes || null,
    }

    const { error } = editData
      ? await supabase.from('expenses').update(payload).eq('id', editData.id)
      : await supabase.from('expenses').insert(payload)

    if (error) {
      setSubmitError(error.message)
    } else {
      setSuccess(true)
      if (!editData) setForm(EMPTY_FORM)
      onSuccess?.()
      setTimeout(() => setSuccess(false), 4000)
    }
    setLoading(false)
  }

  const templatesForType = templates.filter(t => !t.expense_type || t.expense_type === form.expense_type)

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">{editData ? 'Edit Expense' : 'New Expense'}</h2>
        {!editData && <p className="text-sm text-gray-500 mt-1">Log a cost against any unit.</p>}
      </div>

      {success && (
        <div className="mb-5 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {editData ? 'Expense updated.' : 'Expense saved successfully.'}
        </div>
      )}
      {submitError && (
        <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">

        {/* Expense type — pill selector */}
        <section className="px-6 py-5">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Expense type <span className="text-red-500">*</span>
          </p>
          <div className="flex gap-2">
            {EXPENSE_TYPES.map(({ value, label, hint }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleTypeClick(value)}
                className={`flex-1 rounded-lg border px-3 py-3 text-left transition ${
                  form.expense_type === value
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className={`block text-sm font-medium ${form.expense_type === value ? 'text-brand-700' : 'text-gray-800'}`}>
                  {label}
                </span>
                <span className="block text-xs text-gray-400 mt-0.5 leading-snug">{hint}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Unit & Category */}
        <section className="px-6 py-5 grid grid-cols-2 gap-4">
          <Field label="Unit" required>
            <select name="unit_id" value={form.unit_id} onChange={handle} required className={inputClass}>
              <option value="">Select unit…</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select name="category_slug" value={form.category_slug} onChange={handle} className={inputClass}>
              <option value="">Select category…</option>
              {categories.map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
            </select>
          </Field>
        </section>

        {/* Template quick-fill (only shown when templates exist for the type) */}
        {templatesForType.length > 0 && (
          <section className="px-6 py-4 bg-gray-50">
            <Field label="Quick-fill from template" hint="Selecting a template pre-fills description, category, and amount">
              <select
                name="template_id"
                value={form.template_id}
                onChange={handleTemplateChange}
                className={inputClass}
              >
                <option value="">No template — fill manually</option>
                {templatesForType.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          </section>
        )}

        {/* Description, Amount, Date */}
        <section className="px-6 py-5 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Description" required>
              <input
                type="text"
                name="description"
                value={form.description}
                onChange={handle}
                required
                placeholder="e.g. Monthly electricity bill"
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Amount" required>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-400 text-sm">₱</span>
              <input
                type="number"
                name="amount"
                value={form.amount}
                onChange={handle}
                required
                min="0"
                step="0.01"
                placeholder="0.00"
                className={`${inputClass} pl-7`}
              />
            </div>
          </Field>
          <Field label="Expense date" required>
            <input
              type="date"
              name="expense_date"
              value={form.expense_date}
              onChange={handle}
              required
              className={inputClass}
            />
          </Field>
        </section>

        {/* Paid / Unpaid */}
        <section className="px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Payment status</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {form.is_paid ? 'Marked as paid' : 'Unpaid — outstanding'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium ${form.is_paid ? 'text-green-600' : 'text-gray-400'}`}>
                {form.is_paid ? 'Paid' : 'Unpaid'}
              </span>
              <Toggle checked={form.is_paid} onChange={handleToggle} label="Mark as paid" />
            </div>
          </div>

          {form.is_paid && (
            <div className="mt-4">
              <Field label="Payment date" hint="When this expense was actually paid">
                <input
                  type="date"
                  name="paid_date"
                  value={form.paid_date}
                  onChange={handle}
                  className={inputClass}
                />
              </Field>
            </div>
          )}
        </section>

        {/* Notes */}
        <section className="px-6 py-5">
          <Field label="Notes">
            <textarea
              name="notes"
              value={form.notes}
              onChange={handle}
              rows={2}
              placeholder="Invoice number, vendor, or any extra context…"
              className={`${inputClass} resize-none`}
            />
          </Field>
        </section>

        {/* Submit */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex items-center justify-end gap-3">
          {onCancel ? (
            <button type="button" onClick={onCancel}
              className="text-sm text-gray-500 hover:text-gray-700 transition">
              Cancel
            </button>
          ) : (
            <button type="button" onClick={() => setForm(EMPTY_FORM)}
              className="text-sm text-gray-500 hover:text-gray-700 transition">
              Clear
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition"
          >
            {loading ? 'Saving…' : (editData ? 'Update Expense' : 'Save Expense')}
          </button>
        </div>
      </form>
    </div>
  )
}
