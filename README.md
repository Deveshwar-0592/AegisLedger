# AegisLedger v4 Complete - B2B Blockchain Trade Settlement Gateway

Institutional-grade cross-border settlement infrastructure designed for the Russia-UAE trade corridor. This system replaces USD/SWIFT correspondent banking with blockchain-native stablecoin rails.

The v4 Complete release represents a comprehensive overhaul, resolving 61 critical security, architecture, and compliance vulnerabilities to achieve production-grade institutional standards, alongside a full high-fidelity frontend interactive redesign.

---

## Architecture Overview

```text
+------------------------------------------------------------------+
|                      AegisLedger Platform                        |
+--------------+--------------+---------------+--------------------+
|   Frontend   |  API Gateway |  Microservices|   Infrastructure   |
|  (React)     |   (NGINX)    |  (Node/Py)    |                    |
|              |              |               |  PostgreSQL 16     |
|  Dashboard   |  Rate Limit  | Identity Svc  |  Redis 7           |
|  Compliance  |  JWT Verify  | Wallet Svc    |  Apache Kafka      |
|  Transfers   |  TLS Term    | Trade Svc     |  Smart Contracts   |
+--------------+--------------+---------------+--------------------+
```

AegisLedger utilizes a microservices architecture communicating via REST APIs and Apache Kafka event streams, backed by PostgreSQL for relational state, Redis for distributed locking/caching, and Ethereum-compatible Smart Contracts for settlement.

---

## Repository Structure

The project is divided into several domains:

*   `/frontend-app`: The React-based frontend SPA featuring advanced interactive UI primitives.
*   `/services`: Contains 18 distinct microservices, including:
    *   `auth-service`: Handles SSO, JWT issuance (separate user and M2M keys).
    *   `identity-service`: Manages user authentication, FIDO2/WebAuthn assertions, and TOTP MFA.
    *   `kyb-service`: Handles Know Your Business onboarding, encrypting Director and UBO PII at the application layer.
    *   `compliance-service` & `compliance-engine`: Executes AML rules, sanctions screening, and VARA reporting.
    *   `trade-service`: Manages escrow logic and trade document verification.
    *   `wallet-service`: Manages institutional wallet addresses and balances.
    *   `scheduler-service`: Runs recurring payments and daily settlements using Redis distributed locks.
    *   `webhook-service`: Delivers outbound events with strict SSRF and DNS rebinding protection.
    *   `websocket-service`: Provides real-time feeds using a secure ticket-based authentication flow.
    *   `ai-service`: Performs OCR and risk scoring with strict Zod schema validation to prevent prompt injection.
    *   Others: `analytics-service`, `billing-service`, `fiat-service`, `notification-service`, `trading-service`, `business-model`, `developer-portal`.
*   `/smart-contracts`: Solidity contracts managing settlement (`AegisTradeEscrow.sol`, `AegisMultiSig.sol`, `AegisBoLNFT.sol`, `AegisTrancheEscrow.sol`).
*   `/infrastructure`: Docker Compose files, NGINX gateway configurations, database initialization scripts, and Kubernetes deployment manifests.

---

## Security & Compliance Hardening

The v4 release implements strict institutional-grade security measures across all layers:

### Cryptography & Authentication
*   **JWT Integrity**: All JWTs are signed and verified using RS256 asymmetric keys (PEM format). Hardcoded fallback secrets have been completely removed.
*   **M2M Isolation**: Machine-to-machine tokens are signed with a separate symmetric key (`JWT_M2M_SECRET`) to prevent privilege escalation.
*   **MFA & PII Encryption**: TOTP secrets (`mfa_secret`) and sensitive KYB data (Directors, UBOs) are encrypted at the Node.js application layer using AES-256-GCM before being stored in PostgreSQL.
*   **WebAuthn Enforcement**: FIDO2 assertions are strictly verified cryptographically, including origin checks and replay-attack prevention via authenticator counters.

### Smart Contract Security
*   **ECDSA Signatures**: Trade documents are verified using OpenZeppelin ECDSA signature recovery, ensuring only authorized logistics providers can fulfill escrow conditions.
*   **Multi-Signature Escrow**: Institutional multi-sig thresholds are enforced directly within the `releaseFunds` function.
*   **Predictability Fixes**: Escrow IDs are generated using user nonces rather than `block.timestamp` to prevent miner manipulation.

### Infrastructure & Network Isolation
*   **Database Schema Isolation**: All 18 services have dedicated PostgreSQL schemas (`identity_svc`, `wallet_svc`, etc.) and isolated database roles to prevent cross-service data contamination.
*   **Kafka Redundancy**: Kafka operates as a 3-broker cluster with a replication factor of 3 for high availability. Sensitive data (like raw backup codes or password reset tokens) is never published to event buses.
*   **Network Segregation**: Container ports are removed from the host. Services are isolated on a `backend-net` and are only accessible via the NGINX API Gateway routing.
*   **SSRF Protection**: Outbound webhook URLs are strictly validated against internal, loopback, and reserved IP ranges prior to delivery.

---

## Frontend Interactive Redesign

The frontend has been completely overhauled to deliver a premium, high-fidelity experience tailored for institutional users.

### Key UI Features
*   **Interactive Primitives**: 
    *   `GlassCard`: Liquid glass distortion with radial gradient sweeps.
    *   `MagneticButton`: Physics-based buttons with cursor attraction.
    *   `TiltCard`: 3D parallax depth effects on dashboard metrics.
    *   `VirtualTable`: High-performance data tables with neon glow row accents.
*   **Immersive Environments**: 
    *   `AmbientBackground`: High-performance HTML5 Canvas particle system.
    *   `DataStreamOverlay`: Full-screen matrix-style portal for smart contract execution feedback.
    *   `GlitchWrapper`: CRT chromatic aberration and shake effects for system error states.
*   **Accessibility & Controls**: 
    *   A dedicated Settings panel allows users to toggle the `useReducedMotion` context (disabling intensive animations) and `useSoundDesign` context (synthetic audio feedback).
    *   The `AnimatedLogo` and audio contexts respect the Page Visibility API, pausing automatically when the browser tab is inactive to preserve resources.

---

## Deployment Instructions

### Prerequisites
*   Docker and Docker Compose
*   Node.js v20+
*   OpenSSL (for generating RSA keys)

### Local Development Setup

1.  **Generate Secrets**:
    Copy the `.env.example` file to `.env` in the root folder and populate all required fields. You must generate proper RSA keys for JWT signing:
    ```bash
    openssl genrsa -out private.pem 2048
    openssl rsa -in private.pem -pubout -out public.pem
    ```
    Paste the contents into `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY` respectively.

2.  **Start the Backend Infrastructure**:
    The backend consists of 18 microservices, PostgreSQL, Redis, 3 Kafka brokers, and an NGINX API Gateway. Start them all via Docker Compose:
    ```bash
    docker-compose -f infrastructure/docker-compose.yml up -d --build
    ```
    *(Note: This might take a few minutes the first time as it builds all 18 Node/Python services and downloads the database images).*

3.  **Start the Interactive Frontend**:
    Open a **new** terminal window and navigate to the frontend application folder:
    ```bash
    cd frontend-app
    npm install
    npm run dev
    ```

4.  **Access the Platform**:
    *   **Frontend UI**: Open your browser and go to `http://localhost:5173` (or whichever port Vite gives you).
    *   **API Gateway**: The NGINX gateway is listening on `http://localhost:80` and routing traffic to all the underlying microservices automatically. 

    To stop the backend and preserve resources, run:
    ```bash
    docker-compose -f infrastructure/docker-compose.yml down
    ```

### Production Deployment
For production, it is strictly recommended to use Kubernetes (manifests available in `infrastructure/k8s/`). Ensure AWS KMS is utilized for Oracle key management (`ORACLE_KMS_KEY_ID`), TLS is terminated at the cloud load balancer level, and multi-region disaster recovery (RDS Multi-AZ, S3 Cross-Region Replication) is enabled.
