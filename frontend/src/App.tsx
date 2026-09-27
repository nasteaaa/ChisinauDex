import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { Layout } from '@/components/Layout'
import { usePrefs } from '@/lib/prefs'
import { HomePage } from '@/pages/HomePage'
import { NotFoundPage } from '@/pages/NotFoundPage'

// Only the home page (the search) is in the main bundle; every other page downloads when first opened.
const DocumentsPage = lazy(() => import('@/features/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage })))
const DocumentPage = lazy(() => import('@/features/documents/DocumentPage').then((m) => ({ default: m.DocumentPage })))
const ServicesPage = lazy(() => import('@/features/services/ServicesPage').then((m) => ({ default: m.ServicesPage })))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const AboutPage = lazy(() => import('@/pages/AboutPage').then((m) => ({ default: m.AboutPage })))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })))
const AccessibilityPage = lazy(() => import('@/pages/AccessibilityPage').then((m) => ({ default: m.AccessibilityPage })))

function EmployeeOnly({ children }: { children: React.ReactNode }) {
  const { role } = usePrefs()
  return role === 'employee' ? children : <Navigate to="/" replace />
}

const page = (el: React.ReactNode) => <Suspense fallback={<div className="min-h-[60vh]" />}>{el}</Suspense>

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="documente" element={page(<DocumentsPage />)} />
        <Route path="documente/:id" element={page(<DocumentPage />)} />
        <Route path="servicii" element={page(<ServicesPage />)} />
        <Route path="despre" element={page(<AboutPage />)} />
        <Route path="confidentialitate" element={page(<PrivacyPage />)} />
        <Route path="accesibilitate" element={page(<AccessibilityPage />)} />
        <Route path="panou" element={<EmployeeOnly>{page(<DashboardPage />)}</EmployeeOnly>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
