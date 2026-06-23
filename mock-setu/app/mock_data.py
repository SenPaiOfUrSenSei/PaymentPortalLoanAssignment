# Pre-seeded billers, customers, and active loans for Setu BBPS Mock

BILLERS = [
    {
        "id": "HDFC00000NAT01",
        "name": "HDFC Loan Services",
        "categoryName": "loan-repayment",
        "customerParams": [
            {
                "paramName": "Loan Account Number",
                "dataType": "NUMERIC",
                "minLength": 8,
                "maxLength": 12,
                "optional": False,
                "regex": "^[0-9]{8,12}$",
                "visibility": True
            },
            {
                "paramName": "Mobile Number",
                "dataType": "NUMERIC",
                "minLength": 10,
                "maxLength": 10,
                "optional": False,
                "regex": "^[0-9]{10}$",
                "visibility": True
            }
        ]
    },
    {
        "id": "ADIT00000NAT02",
        "name": "Aditya Birla Finance",
        "categoryName": "loan-repayment",
        "customerParams": [
            {
                "paramName": "Loan Account Number",
                "dataType": "NUMERIC",
                "minLength": 6,
                "maxLength": 10,
                "optional": False,
                "regex": "^[0-9]{6,10}$",
                "visibility": True
            },
            {
                "paramName": "Mobile Number",
                "dataType": "NUMERIC",
                "minLength": 10,
                "maxLength": 10,
                "optional": False,
                "regex": "^[0-9]{10}$",
                "visibility": True
            }
        ]
    },
    {
        "id": "SBIL00000NAT03",
        "name": "SBI Loans",
        "categoryName": "loan-repayment",
        "customerParams": [
            {
                "paramName": "Loan Account Number",
                "dataType": "NUMERIC",
                "minLength": 8,
                "maxLength": 12,
                "optional": False,
                "regex": "^[0-9]{8,12}$",
                "visibility": True
            },
            {
                "paramName": "Mobile Number",
                "dataType": "NUMERIC",
                "minLength": 10,
                "maxLength": 10,
                "optional": False,
                "regex": "^[0-9]{10}$",
                "visibility": True
            }
        ]
    }
]

# Outstanding loans linked to specific parameters
LOAN_ACCOUNTS = [
    {
        "biller_id": "HDFC00000NAT01",
        "params": {
            "Loan Account Number": "12345678",
            "Mobile Number": "9876543210"
        },
        "customer_name": "Aarav Sharma",
        "bills": [
            {
                "amount": 2500000,  # in paise (Rs. 25,000.00)
                "billNumber": "HDFC-EMI-998",
                "billPeriod": "MONTHLY",
                "dueDate": "2026-07-05",
                "billDate": "2026-06-05"
            }
        ]
    },
    {
        "biller_id": "HDFC00000NAT01",
        "params": {
            "Loan Account Number": "87654321",
            "Mobile Number": "9123456780"
        },
        "customer_name": "Ishaan Gupta",
        "bills": [
            {
                "amount": 1525000,  # in paise (Rs. 15,250.00)
                "billNumber": "HDFC-EMI-999",
                "billPeriod": "MONTHLY",
                "dueDate": "2026-07-10",
                "billDate": "2026-06-10"
            }
        ]
    },
    {
        "biller_id": "ADIT00000NAT02",
        "params": {
            "Loan Account Number": "1895159",
            "Mobile Number": "9876543210"
        },
        "customer_name": "Manoj Chekuri",
        "bills": [
            {
                "amount": 850000,  # in paise (Rs. 8,500.00)
                "billNumber": "ABF-EMI-101",
                "billPeriod": "MONTHLY",
                "dueDate": "2026-07-01",
                "billDate": "2026-06-01"
            }
        ]
    },
    {
        "biller_id": "SBIL00000NAT03",
        "params": {
            "Loan Account Number": "1111222233",
            "Mobile Number": "9999988888"
        },
        "customer_name": "Priya Patel",
        "bills": [
            {
                "amount": 5000000,  # in paise (Rs. 50,000.00)
                "billNumber": "SBI-EMI-404",
                "billPeriod": "MONTHLY",
                "dueDate": "2026-07-15",
                "billDate": "2026-06-15"
            }
        ]
    },
    {
        "biller_id": "SBIL00000NAT03",
        "params": {
            "Loan Account Number": "4444555566",
            "Mobile Number": "8888877777"
        },
        "customer_name": "Vikram Malhotra",
        "bills": [
            {
                "amount": 1200000,  # in paise (Rs. 12,000.00)
                "billNumber": "SBI-EMI-405",
                "billPeriod": "MONTHLY",
                "dueDate": "2026-07-20",
                "billDate": "2026-06-20"
            }
        ]
    }
]
