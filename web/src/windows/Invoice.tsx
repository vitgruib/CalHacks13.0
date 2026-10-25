// Invoice: one workflow, two personas. Researchers submit and track invoices;
// the grant office verifies them against the purchase order and the grant,
// decides exceptions and keeps the audit trail. `#invoices/<id>` opens one
// invoice in full. Replaces the old Invoices window.
import { useContext, useEffect, useState } from 'react'
import { useStore } from '../data/store'
import InvoicePage from '../invoice/InvoicePage'
import Office from '../invoice/Office'
import Researcher from '../invoice/Researcher'
import { ResearcherContext } from '../people'
import '../invoice/Invoice.css'

const useSubId = () => {
  const read = () => decodeURIComponent(location.hash.split('/')[1] ?? '')
  const [id, setId] = useState(read)
  useEffect(() => {
    const on = () => setId(read())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return id
}

export default function Invoice() {
  const { db } = useStore()
  const researcher = useContext(ResearcherContext)
  const id = useSubId()
  if (id) return <InvoicePage db={db} id={id} />
  return researcher ? <Researcher db={db} name={researcher.name} /> : <Office db={db} />
}
