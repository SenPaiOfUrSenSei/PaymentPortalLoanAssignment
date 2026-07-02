'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from '../../../utils/router'
import { ArrowLeft, Download, ShieldCheck, FileText, CheckCircle2 } from 'lucide-react'
import { authFetch } from '../../../utils/auth'

export default function Invoice() {
  const { txnId } = useParams()
  const navigate = useNavigate()
  
  const [invoice, setInvoice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!txnId) return
    
    authFetch(`/api/invoice/${txnId}`)
      .then(res => {
        if (!res.ok) throw new Error('Invoice not found')
        return res.json()
      })
      .then(data => {
        setInvoice(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [txnId])

  const formatRupees = (paise) => {
    if (!paise) return 'N/A'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(paise / 100)
  }

  const formatTimestamp = (isoStr) => {
    if (!isoStr) return 'N/A'
    return new Date(isoStr).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'medium'
    })
  }

  const handleDownloadPDF = () => {
    const element = document.getElementById('invoice-receipt-card')
    if (!element || !window.html2pdf) return
    
    const opt = {
      margin:       15,
      filename:     `EMI-Receipt-${invoice?.billNumber || txnId}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: '#0b0c16',
        logging: false
      },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }
    
    window.html2pdf().from(element).set(opt).save()
  }

  if (loading) {
    return (
      <div className="loading-wrapper">
        <div className="spinner"></div>
        <h2>Loading Payment Receipt</h2>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="glass-panel text-center" style={{ maxWidth: '500px', margin: '20px auto' }}>
        <h2>Receipt Not Found</h2>
        <p>{error || 'The requested transaction is not available.'}</p>
        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => navigate('/')}>
          Return Home
        </button>
      </div>
    )
  }

  return (
    <div className="invoice-wrapper">
      <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', marginBottom: '2rem' }} onClick={() => navigate('/')}>
        <ArrowLeft size={16} /> Back to Home
      </button>

      {/* Invoice receipt container */}
      <div id="invoice-receipt-card" className="glass-panel" style={{ padding: '3rem', position: 'relative' }}>
        <div className="invoice-header">
          <div>
            <span className="logo" style={{ cursor: 'default', fontSize: '1.6rem' }}>
              ArisX
            </span>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>BBPS Sandbox Portal</p>
          </div>
          <div className="invoice-badge">
            <CheckCircle2 size={14} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} /> Settled
          </div>
        </div>

        <div className="invoice-details-table">
          <div className="invoice-detail-row">
            <span className="invoice-lbl">Transaction ID</span>
            <span className="invoice-val" style={{ fontFamily: 'monospace' }}>{invoice.transactionId}</span>
          </div>
          
          <div className="invoice-detail-row">
            <span className="invoice-lbl">Payment Reference</span>
            <span className="invoice-val" style={{ fontFamily: 'monospace' }}>{invoice.paymentRefId || 'N/A'}</span>
          </div>

          <div className="invoice-detail-row">
            <span className="invoice-lbl">Payment Date</span>
            <span className="invoice-val">{formatTimestamp(invoice.completedAt || invoice.createdAt)}</span>
          </div>

          <div className="invoice-detail-row" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>
            <span className="invoice-lbl">Payment Method</span>
            <span className="invoice-val">{invoice.paymentGateway}</span>
          </div>

          <div className="invoice-detail-row" style={{ paddingTop: '0.5rem' }}>
            <span className="invoice-lbl">Loan Provider</span>
            <span className="invoice-val" style={{ fontWeight: 700 }}>{invoice.billerName}</span>
          </div>

          <div className="invoice-detail-row">
            <span className="invoice-lbl">Biller Code</span>
            <span className="invoice-val">{invoice.billerId}</span>
          </div>

          <div className="invoice-detail-row">
            <span className="invoice-lbl">Customer Name</span>
            <span className="invoice-val">{invoice.customerName}</span>
          </div>

          <div className="invoice-detail-row" style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>
            <span className="invoice-lbl">Loan Bill Number</span>
            <span className="invoice-val">{invoice.billNumber}</span>
          </div>

          <div className="invoice-detail-row" style={{ marginTop: '1rem' }}>
            <span className="invoice-lbl" style={{ fontSize: '1rem', fontWeight: 600 }}>Amount Paid</span>
            <span className="invoice-val-bold gradient-text">{formatRupees(invoice.amount)}</span>
          </div>
        </div>

        <div className="invoice-footer-note">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            <ShieldCheck size={16} color="#10b981" />
            <span>Official BBPS Transaction Receipt. Managed via Setu BBPS.</span>
          </div>
        </div>
      </div>

      <div className="invoice-actions">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          Make Another Payment
        </button>
        
        <button className="btn btn-primary" onClick={handleDownloadPDF}>
          Download Invoice <Download size={18} />
        </button>
      </div>
    </div>
  )
}
