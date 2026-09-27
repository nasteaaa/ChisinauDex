import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useDashboard } from './api'
import { InternalAssistant } from './InternalAssistant'

/**
 * Home-page panel for municipal employees (the brief serves citizens *and* staff):
 * route a citizen's situation to the right institution and see what is waiting in content management.
 */
export function EmployeePanel() {
  const { t } = useTranslation()
  const dash = useDashboard()
  const d = dash.data
  const todo: [string, number | undefined, string][] = [
    [t('dash.segConf'), d?.conflicts.filter((c) => c.state !== 'resolved').length, 'var(--warn)'],
    [t('dash.segGaps'), d?.gaps.filter((g) => g.state === 'open').length, 'var(--warn)'],
    [t('dash.segPages'), d?.pages.filter((p) => p.state === 'open').length, d?.pages.some((p) => p.state === 'open' && p.type === 'hacked') ? 'var(--bad)' : 'var(--warn)']
  ]

  return (
    <aside aria-labelledby="emp-title" className="flex w-full min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-md border border-rule bg-surface px-5 pb-4 pt-4.5">
        <div className="flex flex-col gap-0.5">
          <h2 id="emp-title" className="m-0 text-[17px] font-bold">{t('emp.title')}</h2>
          <p className="m-0 text-sm leading-normal text-subtle">{t('emp.intro')}</p>
        </div>
        <InternalAssistant compact />
        <div className="flex flex-col gap-1.5 border-t border-rule pt-3">
          <h3 className="m-0 text-[15px] font-bold">{t('emp.todo')}</h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {todo.map(([label, n, color]) => (
              <li key={label} className="flex items-center justify-between border-b border-rule-soft py-1.5 text-sm last:border-b-0">
                <span>{label}</span>
                <span className="min-w-6 rounded-full px-1.5 text-center text-xs font-bold leading-snug text-white" style={{ background: n ? color : 'var(--ok)' }}>{n ?? '…'}</span>
              </li>
            ))}
          </ul>
          <Link to="/panou" className="self-start text-sm font-semibold no-underline">{t('emp.openDashboard')} →</Link>
        </div>
      </div>
    </aside>
  )
}
