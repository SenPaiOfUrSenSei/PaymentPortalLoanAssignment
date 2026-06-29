# ArisX - Loan Payment Portal

**ArisX** is a premium, high-performance **Loan Payment Portal** built to integrate with the **Setu BBPS (v2) BillPay APIs** and **Decentro Bureau Score Handshakes**. It features a modern, responsive monochrome light-themed user interface, interactive credit bureau scoring simulators, automated UPI Mandate notifications, and printable digital receipts (with PDF download support).

---

## 🚀 Key Features

* **Setu BBPS (v2) Sandbox**: Simulates official Bharat Bill Payment System (BBPS) flows via a mock Setu server (OAuth 2.0 token grant, bill fetches, status polling, and payment completion).
* **Decentro Bureau score handshake**: Performs a deterministic bureau-scoring matrix simulation representing NPCI/Experian regulations, calculating score deltas (± points) for user actions.
* **UPI AutoPay Mandates**: Full recurring collection layout using Setu's UPI AutoPay network.
* **Unified Account Statements**: A consolidated history log querying manual BBPS repayments, completed loan settlements, and AutoPay mandate debits.
* **Modern Design**: Premium light glassmorphism CSS design system with Outfit & Plus Jakarta Sans typography, micro-animations, and responsive visual layout grids.

---

## 🏗️ System Architecture

The application comprises four key services:
1. **`postgres-db`** (Port `5432`): Database for user profiles, biller mappings, fetch sessions, and transaction records.
2. **`mock-setu`** (Port `8081`): Replicates Setu OAuth and BBPS v2 endpoints.
3. **`backend`** (Port `8000`): FastAPI server orchestrating database CRUD operations and forwarding requests to `mock-setu`.
4. **`frontend`** (Port `5173`): Vite Single Page Application using React and Lucide Icons.

---

## 🛠️ Running the Application

You can spin up the application in two ways: using **Docker Compose** (recommended for simplicity) or **Running Locally (Bare-Metal)**.

### Option A: Running with Docker Compose (Containerized)

This option packages and orchestrates all services automatically.

#### Prerequisites
* Make sure you have Docker and Docker Compose installed.

#### Setup and Launch
Run the following commands in the project root:

```bash
# 1. Build and boot backend, mock-setu, and database services
docker compose up -d --build postgres-db mock-setu backend

# 2. Build frontend using local layers (prevents external DNS resolution limits)
docker build --pull=false -t paymentportalforloan-frontend:latest ./frontend

# 3. Boot frontend without forcing rebuild
docker compose up -d --no-build frontend
```

The portal will be running locally at: **[http://localhost:5173](http://localhost:5173)**.

---

### Option B: Running Locally (Bare-Metal)

Use this option to run services natively on your system for local testing/development.

#### Prerequisites
* **Python 3.11+** installed.
* **Node.js 18+** & **npm** installed.
* **PostgreSQL** installed and running locally.

#### Step 1: Set up the PostgreSQL Database
Create a database named `payment_portal` in your local Postgres instance:
```sql
CREATE DATABASE payment_portal;
```

#### Step 2: Configure Environment Variables
Create a `.env` file in `backend/` and `mock-setu/` directories or export variables:
```ini
# backend/.env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/payment_portal
SETU_API_BASE_URL=http://localhost:8081
SETU_CLIENT_ID=mock_client_id
SETU_CLIENT_SECRET=mock_client_secret
SETU_PARTNER_ID=123456
JWT_SECRET=super_secret_jwt_key_arisx_2026
```

#### Step 3: Run the Mock Setu Service
Open a new terminal and navigate to the `mock-setu` folder:
```bash
cd mock-setu
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8081 --host 0.0.0.0
```

#### Step 4: Run the Backend Service
Open a new terminal and navigate to the `backend` folder:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000 --host 0.0.0.0
```
*(FastAPI will automatically create tables and seed default mock loans in PostgreSQL on the first launch)*.

#### Step 5: Run the Frontend Service
Open a new terminal and navigate to the `frontend` folder:
```bash
cd frontend
npm install
npm run dev
```

The React Vite app will run on: **[http://localhost:5173](http://localhost:5173)**.

---

## 🧪 Sandbox Testing Flow

### Demo Credentials
To test the full bill fetching, AutoPay mandate creation, settlement, and bureau score updates, sign in with one of the pre-seeded credentials:

* **Demo User 1**:
  - **Mobile Number**: `9876543210`
  - **Legal Name**: Aarav Sharma
  - **OTP**: Use any 6-digit number (e.g. `123456`)
  - **Seeded accounts**: Aditya Birla Finance (`1895159`), HDFC Loan Services (`12345678`)

* **Demo User 2**:
  - **Mobile Number**: `9999988888`
  - **Legal Name**: Priya Patel
  - **OTP**: Use any 6-digit number
  - **Seeded accounts**: SBI Loans (`1111222233`)

### Automated API Integration Test
A pre-configured python integration test is available to run the entire backend BBPS mock cycle programmatically:

```bash
# Run the end-to-end flow test
python3 test_flow.py
```

---

## 📂 Project Structure

```text
Payment Portal For Loan/
├── backend/
│   ├── app/
│   │   ├── core/           # Config, security, DB session definitions
│   │   ├── models/         # SQLAlchemy models (PostgreSQL)
│   │   ├── schemas/        # Pydantic validation schemas
│   │   ├── crud/           # Database CRUD helper functions
│   │   └── routers/        # FastAPI routers (auth, portal, mandates)
│   ├── Dockerfile
│   └── requirements.txt
├── mock-setu/
│   ├── app/
│   │   ├── mock_data.py    # Seeded billers and active sandbox accounts
│   │   └── main.py         # Mock server mimicking Setu BBPS v2 APIs
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/          # Home, Billers, Identify, LoanList, CheckoutSimulate, Settlement, AutopayDashboard, Statement
│   │   ├── styles/         # Glassmorphic custom CSS rules
│   │   ├── App.jsx         # Routes registration & Layout container
│   │   └── main.jsx
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.js
└── docker-compose.yml
```
