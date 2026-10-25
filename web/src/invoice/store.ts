// Invoice submissions, from whichever backend the app runs on: live, the
// module's invoiceSubmission table, so a researcher's submission and the grant
// office's decisions reach every browser (T112); offline, this browser only.
import { useStore } from '../data/store'
import type { AuditEntry, Status, Submission } from './model'

export const newSubmissionId = () => `sub-${Date.now().toString(36)}`

export const useSubmissions = (): Submission[] => useStore().submissions

export function useSubmissionActions() {
  const { submissions, saveSubmission } = useStore()
  return {
    saveSubmission,
    /** Add an audit entry and optionally move the status. */
    record: (id: string, entry: AuditEntry, status?: Status) => {
      const s = submissions.find(x => x.id === id)
      if (s) saveSubmission({ ...s, status: status ?? s.status, audit: [...s.audit, entry] })
    },
  }
}
