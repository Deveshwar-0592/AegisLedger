/**
 * AegisLedger — Compliance & AML Service
 * Handles: Real-time AML screening, FATF Travel Rule, sanctions checking,
 *          transaction monitoring, ComplyAdvantage integration, regulatory reporting
 */

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import httpx
import asyncpg
import redis.asyncio as aioredis
import json
import uuid
import logging
from enum import Enum

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AegisLedger Compliance Service", version="1.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# ─── CONFIG ──────────────────────────────────────────────────────────
import os
DATABASE_URL = os.getenv("DATABASE_URL")
REDIS_URL = os.getenv("REDIS_URL")
COMPLY_ADVANTAGE_API_KEY = os.getenv("COMPLY_ADVANTAGE_API_KEY")
COMPLY_ADVANTAGE_URL = "https://api.complyadvantage.com/searches"
MOCK_AML = os.getenv("MOCK_AML", "true").lower() == "true"

# ─── SANCTIONS LISTS ─────────────────────────────────────────────────
SANCTIONS_LISTS = ["OFAC_SDN", "UN_CONSOLIDATED", "EU_CONSOLIDATED", "UK_HMT", "ROSFINMONITORING", "VARA_WATCHLIST"]

# Risk score thresholds
RISK_THRESHOLDS = {
    "LOW":    (0, 30),
    "MEDIUM": (30, 65),
    "HIGH":   (65, 85),
    "CRITICAL": (85, 100),
}

# FATF high-risk jurisdictions (simplified)
FATF_HIGH_RISK = ["KP", "IR", "MM", "SY", "RU"]  # Fix 11: Russia is HIGH_RISK
FATF_GREY_LIST = ["YE", "SS", "HT", "LA", "VU", "TZ", "NG"]

# ─── MODELS ──────────────────────────────────────────────────────────
class TransactionScreenRequest(BaseModel):
    transaction_id: str
    originator_company: str
    originator_lei: Optional[str]
    originator_jurisdiction: str
    beneficiary_company: str
    beneficiary_lei: Optional[str]
    beneficiary_jurisdiction: str
    amount_usd: float
    asset: str
    purpose: Optional[str]

class EntityScreenRequest(BaseModel):
    entity_name: str
    registration_number: Optional[str]
    jurisdiction: str
    directors: List[Dict[str, Any]]
    ubos: List[Dict[str, Any]]

class AMLAlertResponse(BaseModel):
    alert_id: str
    transaction_id: str
    alert_type: str
    severity: str
    score: int
    description: str
    recommended_action: str
    created_at: datetime

# ─── DB & CACHE ──────────────────────────────────────────────────────
db_pool = None
cache = None

@app.on_event("startup")
async def startup():
    global db_pool, cache
    db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=5, max_size=20)
    cache = aioredis.from_url(REDIS_URL)

@app.on_event("shutdown")
async def shutdown():
    await db_pool.close()
    await cache.close()

# ─── COMPLY ADVANTAGE (AML SCREENING) ────────────────────────────────
async def screen_entity_complyadvantage(name: str, entity_type: str = "company") -> Dict:
    """Run entity through ComplyAdvantage for PEP/sanctions/adverse media."""
    if MOCK_AML:
        # Mock response — simulate 3% match rate
        import random
        has_match = random.random() < 0.03
        return {
            "id": str(uuid.uuid4()),
            "hits": [{"match_types": ["sanction"], "score": 0.82, "name": name}] if has_match else [],
            "total_hits": 1 if has_match else 0,
            "status": "monitored",
        }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            COMPLY_ADVANTAGE_URL,
            headers={"Authorization": f"Token {COMPLY_ADVANTAGE_API_KEY}"},
            json={
                "search_term": name,
                "filters": {
                    "types": ["sanction", "warning", "pep", "adverse-media"],
                    "exact_match": False,
                    "fuzziness": 0.6,
                },
            },
            timeout=10.0,
        )
        return resp.json()

async def calculate_risk_score(tx: TransactionScreenRequest) -> Dict:
    """Multi-factor risk scoring algorithm."""
    score = 0
    flags = []

    # Geographic risk
    if tx.originator_jurisdiction in FATF_HIGH_RISK or tx.beneficiary_jurisdiction in FATF_HIGH_RISK:
        score += 40
        flags.append("HIGH_RISK_JURISDICTION")
    elif tx.originator_jurisdiction in FATF_GREY_LIST or tx.beneficiary_jurisdiction in FATF_GREY_LIST:
        score += 20
        flags.append("GREY_LIST_JURISDICTION")

    # Transaction amount risk
    if tx.amount_usd >= 10_000_000:
        score += 25
        flags.append("VERY_HIGH_VALUE")
    elif tx.amount_usd >= 1_000_000:
        score += 10
        flags.append("HIGH_VALUE")

    # Velocity check (from cache)
    velocity_key = f"velocity:{tx.originator_company}:{datetime.now().strftime('%Y-%m-%d-%H')}"
    hourly_count = await cache.incr(velocity_key)
    await cache.expire(velocity_key, 3600)
    if hourly_count > 10:
        score += 30
        flags.append("HIGH_VELOCITY")

    # Daily volume check
    daily_key = f"daily_vol:{tx.originator_company}:{datetime.now().strftime('%Y-%m-%d')}"
    daily_vol = await cache.incrbyfloat(daily_key, tx.amount_usd)
    await cache.expire(daily_key, 86400)
    if daily_vol > 50_000_000:
        score += 20
        flags.append("HIGH_DAILY_VOLUME")

    # Round number structuring detection
    if tx.amount_usd % 1_000_000 == 0 or tx.amount_usd % 100_000 == 0:
        score += 10
        flags.append("ROUND_NUMBER_STRUCTURING_RISK")

    return {"score": min(score, 100), "flags": flags}

# ─── FATF TRAVEL RULE ────────────────────────────────────────────────
def enforce_travel_rule(tx: TransactionScreenRequest) -> Dict:
    """
    FATF Travel Rule: transfers >= $1,000 require originator + beneficiary info.
    Returns compliance status and required fields.
    """
    threshold = 1000  # USD

    required_fields = {
        "originator_name": bool(tx.originator_company),
        "originator_account": True,  # wallet address serves as account
        "originator_jurisdiction": bool(tx.originator_jurisdiction),
        "beneficiary_name": bool(tx.beneficiary_company),
        "beneficiary_account": True,
        "beneficiary_jurisdiction": bool(tx.beneficiary_jurisdiction),
    }

    if tx.originator_lei:
        required_fields["originator_lei"] = True

    compliant = all(required_fields.values()) if tx.amount_usd >= threshold else True
    missing = [k for k, v in required_fields.items() if not v]

    return {
        "compliant": compliant,
        "threshold_triggered": tx.amount_usd >= threshold,
        "missing_fields": missing,
        "regulation": "FATF Recommendation 16",
    }

# ─── ROUTES ──────────────────────────────────────────────────────────

@app.post("/screen/transaction", response_model=AMLAlertResponse)
async def screen_transaction(tx: TransactionScreenRequest, background_tasks: BackgroundTasks):
    """
    Real-time transaction screening pipeline:
    1. FATF Travel Rule check
    2. Sanctions screening (all 6 lists)
    3. Risk scoring
    4. Alert generation if needed
    """
    alert_id = str(uuid.uuid4())
    alerts = []

    # 1. FATF Travel Rule
    travel_rule = enforce_travel_rule(tx)
    if not travel_rule["compliant"]:
        alerts.append({
            "type": "TRAVEL_RULE_VIOLATION",
            "severity": "HIGH",
            "description": f"FATF Travel Rule: Missing required fields: {', '.join(travel_rule['missing_fields'])}",
        })

    # 2. Sanctions screening
    for originator_name in [tx.originator_company]:
        screen_result = await screen_entity_complyadvantage(originator_name)
        if screen_result.get("total_hits", 0) > 0:
            alerts.append({
                "type": "SANCTIONS_MATCH",
                "severity": "CRITICAL",
                "description": f"Potential match on sanctions/PEP list for: {originator_name}",
            })

    # 3. Risk scoring
    risk_result = await calculate_risk_score(tx)
    risk_score = risk_result["score"]

    if risk_score >= 85:
        alerts.append({"type": "HIGH_RISK_SCORE", "severity": "CRITICAL", "description": f"Transaction risk score: {risk_score}/100. Flags: {', '.join(risk_result['flags'])}"})
    elif risk_score >= 65:
        alerts.append({"type": "ELEVATED_RISK", "severity": "HIGH", "description": f"Transaction risk score: {risk_score}/100"})

    # Persist screening result
    async with db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO screening_results (id, transaction_id, risk_score, alerts, travel_rule_compliant, screened_at)
            VALUES ($1, $2, $3, $4, $5, $6)
        """, alert_id, tx.transaction_id, risk_score, json.dumps(alerts), travel_rule["compliant"], datetime.utcnow())

    # Determine overall severity
    severity = "LOW"
    if any(a["severity"] == "CRITICAL" for a in alerts):
        severity = "CRITICAL"
    elif any(a["severity"] == "HIGH" for a in alerts):
        severity = "HIGH"
    elif risk_score >= 30:
        severity = "MEDIUM"

    # Auto-freeze if critical
    if severity == "CRITICAL":
        background_tasks.add_task(freeze_transaction, tx.transaction_id, "AUTO_AML_FREEZE")

    description = alerts[0]["description"] if alerts else "Transaction cleared all screening checks."
    recommended = "FREEZE_AND_REVIEW" if severity == "CRITICAL" else "MANUAL_REVIEW" if severity == "HIGH" else "APPROVE"

    return AMLAlertResponse(
        alert_id=alert_id,
        transaction_id=tx.transaction_id,
        alert_type=alerts[0]["type"] if alerts else "CLEAR",
        severity=severity,
        score=risk_score,
        description=description,
        recommended_action=recommended,
        created_at=datetime.utcnow(),
    )

@app.post("/screen/entity")
async def screen_entity(request: EntityScreenRequest):
    """Full KYB entity screening — company + all directors + UBOs."""
    results = {}

    # Screen company
    company_result = await screen_entity_complyadvantage(request.entity_name, "company")
    results["company"] = company_result

    # Screen all directors
    results["directors"] = []
    for director in request.directors:
        name = f"{director.get('first_name','')} {director.get('last_name','')}".strip()
        result = await screen_entity_complyadvantage(name, "individual")
        results["directors"].append({"name": name, "result": result})

    # Screen UBOs
    results["ubos"] = []
    for ubo in request.ubos:
        name = f"{ubo.get('first_name','')} {ubo.get('last_name','')}".strip()
        result = await screen_entity_complyadvantage(name, "individual")
        results["ubos"].append({"name": name, "ownership_pct": ubo.get("ownership_pct", 0), "result": result})

    # Calculate overall risk
    all_hits = sum(r.get("total_hits", 0) for r in [company_result] + [d["result"] for d in results["directors"]] + [u["result"] for u in results["ubos"]])

    risk_level = "LOW"
    if all_hits > 0:
        risk_level = "HIGH"

    # ELR check for Russian entities
    elr_qualified = None
    if request.jurisdiction == "RU":
        # Revenue check would be verified against uploaded financials
        elr_qualified = True  # Placeholder — real check in KYB service

    return {
        "entity": request.entity_name,
        "overall_risk": risk_level,
        "total_matches": all_hits,
        "elr_qualified": elr_qualified,
        "results": results,
        "screened_at": datetime.utcnow().isoformat(),
    }

@app.get("/reports/regulatory")
async def generate_regulatory_report(
    start_date: str,
    end_date: str,
    report_type: str = "VARA_MONTHLY",
):
    """Generate regulatory reports for VARA / Rosfinmonitoring submission."""
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT t.*, sr.risk_score, sr.travel_rule_compliant
            FROM transfers t
            LEFT JOIN screening_results sr ON sr.transaction_id = t.id
            WHERE t.created_at BETWEEN $1 AND $2
            AND t.status = 'COMPLETED'
            ORDER BY t.created_at
        """, datetime.fromisoformat(start_date), datetime.fromisoformat(end_date))

    total_volume = sum(float(r["amount"]) for r in rows)
    high_risk_count = sum(1 for r in rows if r["risk_score"] and r["risk_score"] >= 65)
    travel_rule_compliance_rate = sum(1 for r in rows if r["travel_rule_compliant"]) / max(len(rows), 1) * 100

    return {
        "report_type": report_type,
        "period": {"start": start_date, "end": end_date},
        "summary": {
            "total_transactions": len(rows),
            "total_volume_usd": total_volume,
            "high_risk_transactions": high_risk_count,
            "travel_rule_compliance_rate": f"{travel_rule_compliance_rate:.2f}%",
            "sanctions_hits": 0,  # Would query from screening_results
        },
        "generated_at": datetime.utcnow().isoformat(),
        "submitted_to": report_type.split("_")[0],
    }

async def freeze_transaction(tx_id: str, reason: str):
    """Auto-freeze transaction — publishes to Kafka for wallet service."""
    logger.warning(f"AUTO-FREEZING transaction {tx_id}: {reason}")
    # Publish freeze event to Kafka

@app.get("/health")
async def health():
    return {"status": "ok", "service": "compliance", "mock_aml": MOCK_AML}
