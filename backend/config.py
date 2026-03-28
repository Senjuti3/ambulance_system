"""Application configuration loaded from environment variables."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production-ambusync")
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "ambusync")
JWT_SECRET = os.environ.get("JWT_SECRET", SECRET_KEY)
JWT_ALGORITHM = "HS256"
# Short-lived access tokens; adjust for production refresh-token flow.
JWT_EXPIRE_HOURS = int(os.environ.get("JWT_EXPIRE_HOURS", "24"))

FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")
PORT = int(os.environ.get("PORT", "5000"))

# Optional: Google Generative AI for summaries (legacy); triage can run without it.
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "").strip()

# Vitals thresholds for alerting (demo defaults).
THRESHOLDS = {
    "heart_rate": {"min": 50, "max": 120},
    "bp_systolic": {"min": 90, "max": 140},
    "bp_diastolic": {"min": 60, "max": 90},
    "temperature_c": {"min": 36.0, "max": 37.8},
    "glucose_mg_dl": {"min": 70, "max": 140},
}
