"""
MongoDB data access for AmbuSync: verification workflows, vitals, emergencies, cases.
All timestamps stored as BSON Date or ISO strings where noted.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from bson import ObjectId
from pymongo import ASCENDING, MongoClient

from config import MONGO_DB_NAME, MONGO_URI

_client: MongoClient | None = None


def get_db():
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    return _client[MONGO_DB_NAME]


def init_indexes():
    db = get_db()
    db.hospitals.create_index("email", unique=True)
    db.hospitals.create_index("public_id", unique=True)
    db.ambulances.create_index("ambulance_id", unique=True)
    db.ambulances.create_index("email", unique=True)
    db.admin_users.create_index("email", unique=True)
    db.emergency_requests.create_index([("created_at", ASCENDING)])
    db.health_readings.create_index([("session_id", ASCENDING), ("timestamp", ASCENDING)])
    db.cases.create_index([("created_at", ASCENDING)])


def _now():
    return datetime.now(timezone.utc)


def _hospital_out(doc: dict | None) -> dict | None:
    if not doc:
        return None
    d = dict(doc)
    d["_id"] = str(d["_id"])
    if "password_hash" in d:
        del d["password_hash"]
    return d


def _ambulance_out(doc: dict | None) -> dict | None:
    if not doc:
        return None
    d = dict(doc)
    d["_id"] = str(d["_id"])
    if "password_hash" in d:
        del d["password_hash"]
    return d


# --- Admin users ---


def create_admin_user(email: str, password_hash: str, name: str) -> str:
    db = get_db()
    doc = {
        "email": email.lower().strip(),
        "password_hash": password_hash,
        "name": name,
        "role": "admin",
        "created_at": _now(),
    }
    res = db.admin_users.insert_one(doc)
    return str(res.inserted_id)


def get_admin_by_email(email: str) -> dict | None:
    db = get_db()
    return db.admin_users.find_one({"email": email.lower().strip()})


def admin_count() -> int:
    return get_db().admin_users.count_documents({})


# --- Hospitals ---


def register_hospital(data: dict) -> dict:
    """Create hospital account; verification_status defaults to pending."""
    db = get_db()
    public_id = str(uuid.uuid4())
    doc = {
        "public_id": public_id,
        "email": data["email"].lower().strip(),
        "password_hash": data["password_hash"],
        "name": data["name"].strip(),
        "address": data.get("address", "").strip(),
        "latitude": float(data["latitude"]),
        "longitude": float(data["longitude"]),
        "uhid": data.get("uhid", "").strip(),
        "hospital_type": data.get("hospital_type", "private").strip().lower(),
        "specialization": data.get("specialization", "").strip(),
        "specializations": _parse_specializations(
            data.get("specialization", ""), data.get("specializations")
        ),
        "contact_phone": data.get("contact_phone", "").strip(),
        "contact_email": (data.get("contact_email") or data["email"]).strip(),
        "verification_status": "pending",
        "is_active": True,
        "admin_note": "",
        "created_at": _now(),
        "updated_at": _now(),
    }
    db.hospitals.insert_one(doc)
    return _hospital_out(doc)


def _parse_specializations(spec_text: str, spec_list: list | None) -> list[str]:
    if spec_list:
        return [str(x).strip().lower() for x in spec_list if str(x).strip()]
    parts = [p.strip().lower() for p in spec_text.replace(";", ",").split(",")]
    return [p for p in parts if p]


def get_hospital_by_email(email: str) -> dict | None:
    return get_db().hospitals.find_one({"email": email.lower().strip()})


def get_hospital_by_public_id(public_id: str) -> dict | None:
    return get_db().hospitals.find_one({"public_id": public_id})


def list_hospitals_by_status(status: str | None = None) -> list[dict]:
    db = get_db()
    q: dict = {}
    if status:
        q["verification_status"] = status
    cur = db.hospitals.find(q).sort("created_at", -1)
    return [_hospital_out(d) for d in cur]


def list_verified_hospitals_for_routing() -> list[dict]:
    """Approved + active hospitals with coordinates for triage routing."""
    db = get_db()
    cur = db.hospitals.find(
        {
            "verification_status": "approved",
            "is_active": True,
        }
    )
    out = []
    for d in cur:
        specs = d.get("specializations") or []
        if not specs and d.get("specialization"):
            specs = _parse_specializations(d["specialization"], None)
        out.append(
            {
                "public_id": d["public_id"],
                "id": d["public_id"],
                "name": d["name"],
                "latitude": float(d["latitude"]),
                "longitude": float(d["longitude"]),
                "specializations": specs,
            }
        )
    return out


def list_hospitals_public_directory() -> list[dict]:
    """Minimal directory for patient/crew dropdown (verified only)."""
    rows = list_verified_hospitals_for_routing()
    return [
        {
            "id": r["public_id"],
            "name": r["name"],
            "specializations": r["specializations"],
        }
        for r in rows
    ]


def set_hospital_verification(
    public_id: str, status: str, admin_note: str = ""
) -> dict | None:
    if status not in ("pending", "approved", "rejected"):
        raise ValueError("invalid status")
    db = get_db()
    db.hospitals.update_one(
        {"public_id": public_id},
        {
            "$set": {
                "verification_status": status,
                "admin_note": admin_note,
                "updated_at": _now(),
            }
        },
    )
    return _hospital_out(get_hospital_by_public_id(public_id))


def set_hospital_active(public_id: str, is_active: bool) -> dict | None:
    db = get_db()
    db.hospitals.update_one(
        {"public_id": public_id},
        {"$set": {"is_active": is_active, "updated_at": _now()}},
    )
    return _hospital_out(get_hospital_by_public_id(public_id))


# --- Ambulances ---


def register_ambulance(data: dict, id_proof_path: str | None) -> dict:
    db = get_db()
    doc = {
        "ambulance_id": data["ambulance_id"].strip(),
        "email": data["email"].lower().strip(),
        "password_hash": data["password_hash"],
        "driver_name": data["driver_name"].strip(),
        "vehicle_number": data["vehicle_number"].strip().upper(),
        "license_number": data["license_number"].strip(),
        "id_proof_path": id_proof_path,
        "ambulance_type": data["ambulance_type"].strip().upper(),
        "verification_status": "pending",
        "is_active": True,
        "status": "Available",
        "admin_note": "",
        "created_at": _now(),
        "updated_at": _now(),
    }
    db.ambulances.insert_one(doc)
    return _ambulance_out(doc)


def get_ambulance_raw_by_id(ambulance_id: str) -> dict | None:
    return get_db().ambulances.find_one({"ambulance_id": ambulance_id})


def get_ambulance_by_email(email: str) -> dict | None:
    return get_db().ambulances.find_one({"email": email.lower().strip()})


def list_ambulances() -> list[dict]:
    db = get_db()
    cur = db.ambulances.find({}).sort("ambulance_id", ASCENDING)
    return [_ambulance_out(d) for d in cur]


def list_ambulances_verified_active() -> list[dict]:
    """Operational pool: approved + active + Available/Busy shown for demo."""
    db = get_db()
    cur = db.ambulances.find(
        {"verification_status": "approved", "is_active": True}
    ).sort("ambulance_id", ASCENDING)
    return [_ambulance_out(d) for d in cur]


def list_ambulances_by_status(verification_status: str | None = None) -> list[dict]:
    db = get_db()
    q: dict = {}
    if verification_status:
        q["verification_status"] = verification_status
    cur = db.ambulances.find(q).sort("created_at", -1)
    return [_ambulance_out(d) for d in cur]


def set_ambulance_verification(
    ambulance_id: str, status: str, admin_note: str = ""
) -> dict | None:
    if status not in ("pending", "approved", "rejected"):
        raise ValueError("invalid status")
    db = get_db()
    db.ambulances.update_one(
        {"ambulance_id": ambulance_id},
        {
            "$set": {
                "verification_status": status,
                "admin_note": admin_note,
                "updated_at": _now(),
            }
        },
    )
    return _ambulance_out(get_ambulance_raw_by_id(ambulance_id))


def set_ambulance_active(ambulance_id: str, is_active: bool) -> dict | None:
    db = get_db()
    db.ambulances.update_one(
        {"ambulance_id": ambulance_id},
        {"$set": {"is_active": is_active, "updated_at": _now()}},
    )
    return _ambulance_out(get_ambulance_raw_by_id(ambulance_id))


def set_ambulance_status(ambulance_id: str, status: str) -> None:
    get_db().ambulances.update_one(
        {"ambulance_id": ambulance_id},
        {"$set": {"status": status, "updated_at": _now()}},
    )


# --- Emergency requests & cases ---


def insert_emergency_request(row: dict) -> str:
    db = get_db()
    doc = {
        "status": "pending",
        "latitude": float(row["latitude"]),
        "longitude": float(row["longitude"]),
        "address_hint": row.get("address_hint") or "",
        "brief_symptoms": row["brief_symptoms"],
        "patient_name": row.get("patient_name") or "",
        "preferred_hospital_id": row.get("preferred_hospital_id"),
        "accepted_at": None,
        "accepted_by_ambulance_id": None,
        "created_at": _now(),
    }
    res = db.emergency_requests.insert_one(doc)
    return str(res.inserted_id)


def _serialize_request(doc: dict | None) -> dict | None:
    if not doc:
        return None
    d = dict(doc)
    oid = str(d["_id"])
    d["_id"] = oid
    d["id"] = oid
    if isinstance(d.get("created_at"), datetime):
        d["created_at"] = d["created_at"].isoformat()
    if isinstance(d.get("accepted_at"), datetime):
        d["accepted_at"] = d["accepted_at"].isoformat()
    return d


def get_emergency_request(req_id: str) -> dict | None:
    db = get_db()
    doc = db.emergency_requests.find_one({"_id": ObjectId(req_id)})
    return _serialize_request(doc)


def list_emergency_requests(status: str | None = None) -> list[dict]:
    db = get_db()
    q: dict = {}
    if status:
        q["status"] = status
    cur = db.emergency_requests.find(q).sort("created_at", -1).limit(100)
    return [_serialize_request(d) for d in cur]


def accept_emergency_request(request_id: str, ambulance_id: str) -> dict | None:
    """Only verified + active ambulances in Available status may accept."""
    db = get_db()
    amb = get_ambulance_raw_by_id(ambulance_id)
    if not amb or amb.get("verification_status") != "approved":
        return None
    if not amb.get("is_active", True):
        return None
    if amb.get("status") != "Available":
        return None

    req_oid = ObjectId(request_id)
    req = db.emergency_requests.find_one({"_id": req_oid})
    if not req or req.get("status") != "pending":
        return None

    now = _now()
    db.emergency_requests.update_one(
        {"_id": req_oid, "status": "pending"},
        {
            "$set": {
                "status": "accepted",
                "accepted_at": now,
                "accepted_by_ambulance_id": ambulance_id,
            }
        },
    )
    db.ambulances.update_one(
        {"ambulance_id": ambulance_id},
        {"$set": {"status": "Busy", "updated_at": now}},
    )
    return get_emergency_request(request_id)


def mark_request_triaged(request_id: str) -> None:
    db = get_db()
    db.emergency_requests.update_one(
        {"_id": ObjectId(request_id)},
        {"$set": {"status": "triaged"}},
    )


def insert_case(row: dict) -> str:
    db = get_db()
    doc = {
        "request_id": row.get("request_id"),
        "ambulance_id": row.get("ambulance_id"),
        "patient_name": row["patient_name"],
        "age": int(row["age"]),
        "sex": row.get("sex") or "",
        "symptoms": row["symptoms"],
        "bp_systolic": int(row["bp_systolic"]),
        "bp_diastolic": int(row["bp_diastolic"]),
        "pulse": int(row["pulse"]),
        "spo2": int(row["spo2"]),
        "consciousness": row["consciousness"],
        "latitude": row.get("latitude"),
        "longitude": row.get("longitude"),
        "address_hint": row.get("address_hint") or "",
        "summary": row["summary"],
        "urgency": row["urgency"],
        "hospital_id": row.get("hospital_id"),
        "hospital_name": row.get("hospital_name"),
        "hospital_selection_reason": row.get("hospital_selection_reason") or "",
        "created_at": _now(),
    }
    res = db.cases.insert_one(doc)
    return str(res.inserted_id)


def _serialize_case(doc: dict | None) -> dict | None:
    if not doc:
        return None
    d = dict(doc)
    d["_id"] = str(d["_id"])
    d["id"] = d["_id"]
    if isinstance(d.get("created_at"), datetime):
        d["created_at"] = d["created_at"].isoformat()
    return d


def list_cases_recent(limit: int = 50) -> list[dict]:
    db = get_db()
    cur = db.cases.find({}).sort("created_at", -1).limit(limit)
    return [_serialize_case(d) for d in cur]


def get_case(case_id: str) -> dict | None:
    db = get_db()
    doc = db.cases.find_one({"_id": ObjectId(case_id)})
    return _serialize_case(doc)


# --- Health readings (live vitals history) ---


def insert_health_reading(
    session_id: str,
    reading: dict,
    case_id: str | None = None,
) -> dict:
    db = get_db()
    now = _now()
    doc = {
        "session_id": session_id,
        "case_id": case_id,
        "timestamp": now,
        "heart_rate": reading.get("heart_rate"),
        "bp_systolic": reading.get("bp_systolic"),
        "bp_diastolic": reading.get("bp_diastolic"),
        "temperature_c": reading.get("temperature_c"),
        "glucose_mg_dl": reading.get("glucose_mg_dl"),
        "alerts": reading.get("alerts") or [],
        "ml_abnormal": bool(reading.get("ml_abnormal")),
        "ml_details": reading.get("ml_details") or {},
    }
    res = db.health_readings.insert_one(doc)
    doc["_id"] = str(res.inserted_id)
    doc["timestamp"] = now.isoformat()
    return doc


def list_health_readings(session_id: str, limit: int = 200) -> list[dict]:
    db = get_db()
    cur = (
        db.health_readings.find({"session_id": session_id})
        .sort("timestamp", ASCENDING)
        .limit(limit)
    )
    out = []
    for d in cur:
        x = dict(d)
        x["_id"] = str(x["_id"])
        ts = x.get("timestamp")
        if isinstance(ts, datetime):
            x["timestamp"] = ts.isoformat()
        out.append(x)
    return out


# --- Seed verified demo network when empty ---


def seed_verified_network(min_hospitals: int = 1):
    """
    If no approved hospitals exist, insert demo hospitals & ambulances
    so routing and ambulance crew flows work out of the box.
    """
    from auth_service import hash_password

    db = get_db()
    approved = db.hospitals.count_documents({"verification_status": "approved"})
    if approved >= min_hospitals:
        return

    demo_pw = hash_password("Demo123!")
    demos = [
        {
            "public_id": str(uuid.uuid4()),
            "email": "city.general@hospital.demo",
            "password_hash": demo_pw,
            "name": "City General Hospital",
            "address": "Kolkata Demo",
            "latitude": 22.5726,
            "longitude": 88.3639,
            "uhid": "DEMO-GH-001",
            "hospital_type": "government",
            "specialization": "general, medical, surgical",
            "specializations": ["general", "medical", "surgical"],
            "contact_phone": "+910000000001",
            "contact_email": "city.general@hospital.demo",
            "verification_status": "approved",
            "is_active": True,
            "admin_note": "seed",
            "created_at": _now(),
            "updated_at": _now(),
        },
        {
            "public_id": str(uuid.uuid4()),
            "email": "trauma.center@hospital.demo",
            "password_hash": demo_pw,
            "name": "Regional Trauma & Stroke Center",
            "address": "Kolkata Demo",
            "latitude": 22.5958,
            "longitude": 88.3476,
            "uhid": "DEMO-TR-002",
            "hospital_type": "government",
            "specialization": "trauma, stroke, neuro, critical",
            "specializations": ["trauma", "stroke", "neuro", "critical"],
            "contact_phone": "+910000000002",
            "contact_email": "trauma.center@hospital.demo",
            "verification_status": "approved",
            "is_active": True,
            "admin_note": "seed",
            "created_at": _now(),
            "updated_at": _now(),
        },
        {
            "public_id": str(uuid.uuid4()),
            "email": "cardiac@hospital.demo",
            "password_hash": demo_pw,
            "name": "Institute of Cardiac Sciences",
            "address": "Kolkata Demo",
            "latitude": 22.5448,
            "longitude": 88.3965,
            "uhid": "DEMO-CV-003",
            "hospital_type": "private",
            "specialization": "cardiac, chest, pci, critical",
            "specializations": ["cardiac", "chest", "pci", "critical"],
            "contact_phone": "+910000000003",
            "contact_email": "cardiac@hospital.demo",
            "verification_status": "approved",
            "is_active": True,
            "admin_note": "seed",
            "created_at": _now(),
            "updated_at": _now(),
        },
    ]
    for h in demos:
        if not db.hospitals.count_documents({"email": h["email"]}):
            db.hospitals.insert_one(h)

    demo_amb = [
        {
            "ambulance_id": "AMB-ALS-01",
            "email": "crew.als01@amb.demo",
            "password_hash": demo_pw,
            "driver_name": "Demo Driver ALS-01",
            "vehicle_number": "KA01AB1234",
            "license_number": "DL-DEMO-ALS01",
            "id_proof_path": None,
            "ambulance_type": "ALS",
            "verification_status": "approved",
            "is_active": True,
            "status": "Available",
            "created_at": _now(),
            "updated_at": _now(),
        },
        {
            "ambulance_id": "AMB-BLS-01",
            "email": "crew.bls01@amb.demo",
            "password_hash": demo_pw,
            "driver_name": "Demo Driver BLS-01",
            "vehicle_number": "KA01CD5678",
            "license_number": "DL-DEMO-BLS01",
            "id_proof_path": None,
            "ambulance_type": "BLS",
            "verification_status": "approved",
            "is_active": True,
            "status": "Available",
            "created_at": _now(),
            "updated_at": _now(),
        },
    ]
    for a in demo_amb:
        if not db.ambulances.count_documents({"ambulance_id": a["ambulance_id"]}):
            db.ambulances.insert_one(a)
