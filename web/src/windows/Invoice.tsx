// Invoice: one workflow, two personas. Researchers submit and track invoices;
// the grant office verifies them against the purchase order and the grant,
// decides exceptions and keeps the audit trail. Replaces the old Invoices window.
import { useContext } from 'react'
import { useStore } from '../data/store'
import Office from '../invoice/Office'
import Researcher from '../invoice/Researcher'
import { ResearcherContext } from '../people'
import '../invoice/Invoice.css'

export default function Invoice() {
  const { db } = useStore()
  const researcher = useContext(ResearcherContext)
  return researcher ? <Researcher db={db} name={researcher.name} /> : <Office db={db} />
}
