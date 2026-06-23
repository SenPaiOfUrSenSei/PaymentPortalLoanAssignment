# ArisX - Loan Payment Portal

**ArisX** is a fully containerized, high-performance **Loan Payment Portal** built to integrate with the **Setu BBPS (v2) BillPay APIs**. It features a modern, high-contrast monochrome light-themed user interface, an asynchronous bill-fetching engine, PhonePe/GooglePay payment simulation, and printable digital receipts (with PDF download support).

---

## 🚀 Key Features

* **Setu BBPS (v2) Integration**: Fully mimics official Bharat Bill Payment System (BBPS) flows via a mock Setu sandbox server.
* **Asynchronous Fetching & Polling**: Uses a non-blocking state machine for polling biller data and verifying checkout states.
* **Premium UX/UI**: Styled using a customized CSS design system with Outfit & Plus Jakarta Sans typography, micro-animations, glassmorphic inputs, and responsive card views.
* **Receipt Downloads**: One-click client-side PDF invoice compilation via `html2pdf.js`.
* **Automated Seed/Cache**: Local database cache seeded with pre-configured mock loan accounts for quick end-to-end sandbox execution.

---

## 🏗️ Architecture

ArisX is orchestrated using **Docker Compose** across four services:

1. **`postgres-db`** (Port `5432`): Stores local biller lists, active fetch sessions, and transaction details.
2. **`mock-setu`** (Port `8081`): Simulates Setu's OAuth 2.0 token endpoint and BBPS v2 APIs (fetch, poll, and payment receipt confirmation).
3. **`backend`** (Port `8000`): Built with FastAPI, SQL Alchemy, and Pydantic. Connects to `postgres-db` and forwards verified payloads to `mock-setu`.
4. **`frontend`** (Port `5173`): Single Page Application built with React, Vite, and Lucide React icons.

---

## 🛠️ Getting Started

### Prerequisites
* Docker and Docker Compose installed.

### Setup and Launch
Build and boot the services using Docker Compose:

```bash
# 1. Build backend, mock-setu, and database
docker-compose up -d --build postgres-db mock-setu backend

# 2. Build frontend using local cached layers (recommended to bypass external DNS resolution limits)
docker build --pull=false -t paymentportalforloan-frontend:latest ./frontend

# 3. Boot frontend without rebuilding
docker-compose up -d --no-build frontend
```

The portal will be running locally at: **[http://localhost:5173](http://localhost:5173)**.

---

## 🧪 Testing the Flow

### Demo Credentials
You can use the following seeded account to test the loan repayment pipeline:
* **Biller**: `Aditya Birla Finance` (or search for HDFC/SBI on the providers page)
* **Loan Account Number**: `1895159`
* **Mobile Number**: `9876543210`

### Automated Integration Test
A pre-configured python integration test is available to run the entire BBPS mock cycle programmatically:

```bash
# Run the end-to-end flow test
python3 test_flow.py
```

Expected Output:
```text
=== STARTING END-TO-END PAYMENT PORTAL TEST ===

1. Fetching billers list...
Retrieved 3 billers:
  - HDFC Loan Services (HDFC00000NAT01)
  - Aditya Birla Finance (ADIT00000NAT02)
  - SBI Loans (SBIL00000NAT03)

2. Initiating bill fetch...
Created Fetch Session: 8d4df12f-... | Setu Ref ID: FETCH-...

3. Polling fetch session status...
  Poll 1 status: PENDING
  Poll 2 status: SUCCESS
Fetch Successful! Customer: Manoj Chekuri

4. Initiating payment...
Created Transaction: e1399e50-... | Status: PENDING

5. Simulating payment confirmation on checkout...
Simulation result - Status: SUCCESSFUL | Setu Pay Ref: PAY-...

6. Fetching final invoice receipt...
Retrieved invoice successfully.
=== ALL TESTS PASSED SUCCESSFULLY! ===
```

---

## 📂 Project Structure

```text
Payment Portal For Loan/
├── backend/
│   ├── app/
│   │   ├── core/           # Configuration, security/token management, database
│   │   ├── models/         # SQLAlchemy models (PostgreSQL)
│   │   ├── schemas/        # Pydantic validation schemas
│   │   ├── crud/           # Database CRUD helper functions
│   │   └── routers/        # FastAPI portal routes (billers, fetch, payment, receipt)
│   ├── Dockerfile
│   └── requirements.txt
├── mock-setu/
│   ├── app/
│   │   ├── mock_data.py    # Seeded billers (3) and active customer loans (5)
│   │   └── main.py         # Mock server mimicking Setu BBPS v2 APIs
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/          # Home, Billers, Identify, LoanList, CheckoutSimulate, PaymentStatus, Invoice
│   │   ├── styles/         # Glassmorphic vanilla CSS design system
│   │   ├── App.jsx         # Routes & Shell layout
│   │   └── main.jsx
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.js
└── docker-compose.yml
```
# PaymentPortalLoanAssignment
