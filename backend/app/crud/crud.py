import datetime
from sqlalchemy.orm import Session
from uuid import UUID
from app.models import models

def get_biller(db: Session, biller_id: str):
    return db.query(models.Biller).filter(models.Biller.id == biller_id).first()

def get_billers(db: Session):
    return db.query(models.Biller).all()

def create_biller(db: Session, id: str, name: str, category_name: str, customer_params: list):
    db_biller = models.Biller(
        id=id,
        name=name,
        category_name=category_name,
        customer_params=customer_params
    )
    db.add(db_biller)
    db.commit()
    db.refresh(db_biller)
    return db_biller

def create_fetch_session(db: Session, biller_id: str, fetch_ref_id: str, customer_params: dict):
    db_session = models.CustomerFetchSession(
        biller_id=biller_id,
        fetch_ref_id=fetch_ref_id,
        customer_params=customer_params,
        status="PENDING",
        bills_data=None
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session

def get_fetch_session(db: Session, session_id: UUID):
    return db.query(models.CustomerFetchSession).filter(models.CustomerFetchSession.id == session_id).first()

def update_fetch_session(db: Session, session_id: UUID, status: str, bills_data: list = None):
    db_session = get_fetch_session(db, session_id)
    if db_session:
        db_session.status = status
        if bills_data is not None:
            db_session.bills_data = bills_data
        db.commit()
        db.refresh(db_session)
    return db_session

def create_transaction(db: Session, fetch_session_id: UUID, amount: int, payment_gateway: str, customer_name: str, bill_number: str):
    db_txn = models.Transaction(
        fetch_session_id=fetch_session_id,
        amount=amount,
        payment_gateway=payment_gateway,
        customer_name=customer_name,
        bill_number=bill_number,
        status="PENDING",
        payment_ref_id=None
    )
    db.add(db_txn)
    db.commit()
    db.refresh(db_txn)
    return db_txn

def get_transaction(db: Session, txn_id: UUID):
    return db.query(models.Transaction).filter(models.Transaction.id == txn_id).first()

def update_transaction(db: Session, txn_id: UUID, status: str, payment_ref_id: str = None, completed_at: datetime.datetime = None):
    db_txn = get_transaction(db, txn_id)
    if db_txn:
        db_txn.status = status
        if payment_ref_id is not None:
            db_txn.payment_ref_id = payment_ref_id
        if completed_at is not None:
            db_txn.completed_at = completed_at
        db.commit()
        db.refresh(db_txn)
    return db_txn
