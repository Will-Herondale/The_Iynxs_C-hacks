# SETU — Azure Deployment Plan

**Date:** 2026-10-30  
**Branch:** `coordination/integration-handoff`  
**Backend Commit:** `245da93`  
**Status:** Planning — No resources created or modified  
**Approval Required:** Yes — user approval required before any Azure resource creation  

---

## 1. Azure Subscription Information

| Field | Value |
|-------|-------|
| Subscription Name | Visual Studio Enterprise Subscription |
| Subscription ID | `a1ee9903-7c4d-4e4a-a18c-6283adfdfeb8` |
| Tenant ID | `4e1049f3-0251-4b7a-86e8-e695bbb80b03` |
| User | `mani_rectian@yahoo.com` |
| State | Enabled |

## 2. Available Regions

The following Azure regions are available in this subscription:

| Region | Display Name |
|--------|-------------|
| eastus | East US |
| eastus2 | East US 2 |
| centralus | Central US |
| westus2 | West US 2 |
| westus | West US |

**Recommended region:** East US (closest to existing resource groups, lowest latency for most users)

---

## 3. Azure Provider Registration Status

| Provider | Status | Notes |
|----------|--------|-------|
| `Microsoft.Web` | Registered | App Service, App Service plans |
| `Microsoft.App` | Registered | Container Apps, Container Apps environments |
| `Microsoft.StaticWebApps` | Not registered | Would require registration before use |

---

## 4. Architecture Decision: Azure Static Web Apps + Container Apps vs. Azure App Service

### Option A: Azure Static Web Apps + Azure Container Apps (Recommended)

**Frontend:** Azure Static Web Apps  
**Backend:** Azure Container Apps

| Aspect | Assessment |
|--------|------------|
| **Runtime compatibility** | ✅ Excellent. Static Web Apps hosts React frontend (Vite build output) natively. Container Apps runs Node.js/TypeScript server via Docker container. |
| **Deployment** | GitHub Actions or Azure CLI. Container image built from `packages/server/Dockerfile`. |
| **JSONL persistence** | ⚠️ Requires Azure Blob Storage. Container Apps ephemeral storage is lost on restart. Event log JSONL must be persisted to Blob Storage cold tier. |
| **SSE support** | ✅ Container Apps supports long-lived HTTP connections. SSE works natively. |
| **Polling support** | ✅ Native HTTP polling works without issues. |
| **CORS** | ✅ Full CORS support via Azure Static Web Apps configuration and Container Apps environment variables. |
| **HTTPS** | ✅ Automatic TLS termination at Static Web Apps front door. Container Apps supports HTTPS termination. |
| **Environment variables** | ✅ Both platforms support environment variables. Frontend `VITE_API_MODE=http` and `VITE_API_BASE_URL` configured via Static Web Apps environment variables. Backend `SETU_PORT`, `SETU_LOG_DIR` via Container Apps environment variables. |
| **Cold starts** | Container Apps: ~5-10 seconds on cold start (container pull + init). Static Web Apps: Near-instant for static content. |
| **Availability** | Container Apps: 99.95% SLA with 2+ replicas. Static Web Apps: 99.9% SLA. |
| **Estimated monthly cost (East US)** | ~$75-85/month (see detailed breakdown below) |
| **Deployment complexity** | Medium — requires Docker build, ACR push, Container Apps environment setup, Static Web Apps configuration |
| **Rollback complexity** | Medium — Container Apps supports revision-based rollback. Static Web Apps supports deployment history rollback. |

### Option B: Azure App Service (Web App + App Service Plan)

| Aspect | Assessment |
|--------|------------|
| **Runtime compatibility** | ✅ Good. App Service runs Node.js/TypeScript server natively. Static frontend can be served from App Service or separate Static Web App. |
| **Deployment** | Git deployment, ZIP deploy, or Docker container. |
| **JSONL persistence** | ⚠️ Same issue — App Service ephemeral storage is lost on restart. Requires Azure Blob Storage for persistence. |
| **SSE support** | ✅ App Service supports long-lived HTTP connections. |
| **Polling support** | ✅ Native HTTP polling works. |
| **CORS** | ✅ App Service supports CORS configuration. |
| **HTTPS** | ✅ Automatic TLS termination via App Service. |
| **Environment variables** | ✅ App Service configuration blade supports environment variables. |
| **Cold starts** | Minimal — App Service keeps instances warm by default. |
| **Availability** | 99.95% SLA (Standard tier), 99.9% (Free/Basic) |
| **Estimated monthly cost (East US)** | ~$65-85/month (depends on SKU) |
| **Deployment complexity** | Lower — simpler deployment model than Container Apps |
| **Rollback complexity** | Lower — App Service deployment slots and slot swapping |

---

## 7. Recommended Architecture: Azure Static Web Apps + Azure Container Apps

### Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Azure Front Door (Optional, for production)    │
└──────────────────────┬──────────────────────────────────────┘
         │                                          │
    ┌─────────────────────────────────────────────────────────────┐
    │              Azure Static Web Apps (Frontend)              │
    │              React SPA — Cached at edge CDN              │
    └─────────────────────────────────────────────────────────────┘
         │                                          │
         ▼                                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Azure Container Apps Environment               │
│              (Dapr-enabled, Consumption tier)               │
└─────────────────────────────────────────────────────────────┘
         │                                          │
   ┌─────┴─────────────┐                  ┌─────┴─────────────┐
   ▼                   ▼                  ▼                   ▼
┌─────────┐       ┌─────────────┐    ┌─────────┐       ┌─────────┐
│  SETU   │       │   SETU      │    │  SETU   │       │  SETU   │
│  API    │       │   API       │    │  API    │       │  API    │
│  (pod 1)│       │   (pod 2)   │    │  (pod 3)│       │  (pod 4)│
└─────────┘       └─────────────┘    └─────────┘       └─────────┘
         │                                          │
         ▼                                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Azure Blob Storage (Cold Tier)                 │
│         (Event Log JSONL — append-only, immutable)          │
└─────────────────────────────────────────────────────────────┘
         │                                          │
         ▼                                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Azure Monitor + Application Insights           │
│         (Metrics, Logs, Distributed Tracing, Alerts)        │
└─────────────────────────────────────────────────────────────┘
```

### Resource Specification

| Resource | Name | Location | SKU | Capacity | Purpose |
|----------|------|----------|-----|----------|---------|
| Resource Group | `setu-rg-prod` | East US | — | — | Resource container |
| Static Web App | `setu-frontend-prod` | East US | Free | Frontend hosting |
| Container Apps Environment | `setu-env-prod` | East US | Consumption | Compute environment |
| Container App | `setu-api` | East US | Consumption | 0.25-1 vCPU, 0.5-2 GiB | Backend API |
| Storage Account | `setueventlogs` | East US | Standard_LRS | Cool | Event log JSONL |
| Application Insights | `setu-monitor` | EastUS | Basic | Metrics, logs, alerts |
| Log Analytics Workspace | `setu-log` | EastUS | Per GB | Log storage, KQL queries |

### Estimated Monthly Cost (East US)

| Resource | SKU | Qty | Monthly Cost (USD) |
|----------|-----|-----|-------------------|
| Container Apps (vCPU) | Consumption | 0.25 vCPU avg | ~$15/month |
| Container Apps (Memory) | Consumption | 0.5 GiB avg | ~$6/month |
| Container Apps (Requests) | Consumption | 1M requests | ~$1.10/month |
| Azure Blob Storage | Standard_LRS, Cool | 100 GB | ~$3.45/month |
| Azure Static Web Apps | Free | 1 | ~$0/month |
| Azure Monitor | Basic | 1 GB ingest | ~$2.30/month |
| Azure Monitor | Basic | 1 GB retention | ~$0.28/GB/month |
| **Total Estimated Monthly Cost** | | | **~$54/month** |

---

## 6. Deployment Steps

### Prerequisites

1. Azure CLI authenticated (`az login`)
2. Target subscription selected (`az account set -s a1ee9903-7c4d-4e4a-a18c-6283adfdfeb8`)
3. Resource group created (`az group create -n setu-rg -l eastus`)

### Deployment Steps

#### Step 1: Create Resource Group

```bash
az group create -n setu-rg -l eastus
```

#### Step 2: Create Container Apps Environment

```bash
az containerapp env create \
  --name setu-env-prod \
  --resource-group setu-rg \
  --location eastus
```

#### Step 3: Build and Push Container Image

```bash
# Build Docker image
cd packages/server
docker build -t setu/backend:latest .

# Push to Azure Container Registry
az acr login -n setuacr
docker tag setu/backend:latest setuacr.azurecr.io/setu/backend:latest
docker push setuacr.azurecr.io/setu/backend:latest
```

**Step 4: Deploy Container App**

```bash
az containerapp create \
  --name setu-api \
  --resource-group setu-rg \
  --environment setu-env-prod \
  --image setuacr.azurecr.io/setu/backend:latest \
  --target-port 8080 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 10 \
  --cpu 0.25 \
  --memory 0.5Gi \
  --env-vars PORT=8080 LOG_DIR=/data SETU_LOG_DIR=/data
```

**Step 5: Create Azure Blob Storage for Event Log**

```bash
az storage account create \
  --name setueventlogs \
  --resource-group setu-rg \
  --location eastus \
  --sku Standard_LRS \
  --access-tier Cool
```

**Step 6: Update Environment Variables**

```bash
az containerapp update \
  --name setu-api \
  --resource-group setu-rg \
  --env-vars SETU_LOG_DIR=/data SETU_PORT=8080
```

**Step 7: Configure Frontend (Static Web Apps)**

```bash
# Build frontend
cd frontend
npm run build

# Deploy to Static Web Apps
az staticwebapp create \
  --name setu-frontend \
  --resource-group setu-rg \
  --location eastus \
  --source https://github.com/Will-Herondale/The_Iynxs_C-hacks \
  --branch frontend/main \
  --frontend-location frontend \
  --app-build-command "npm run build" \
  --output-location frontend/packages/ui/dist \
  --api-location "" \
  --api-build-command ""
```

**Step 8: Configure Frontend Environment Variables**

```bash
az staticwebapp update \
  --name setu-frontend \
  --resource-group setu-rg \
  --branch frontend/main \
  --env-vars VITE_API_MODE=http VITE_API_BASE_URL=https://setu-api.<region>.azurecontainerapps.io
```

---

## 6. Rollback Procedure

### Immediate Rollback (within same deployment)

```bash
az containerapp revision list \
  --name setu-api \
  --resource-group setu-rg

az containerapp revision set-active \
  --name setu-api \
  --resource-group setu-rg \
  --revision <previous-revision-name>
```

### Full Rollback (to previous image)

```bash
az containerapp update \
  --name setu-api \
  --resource-group setu-rg \
  --image setuacr.azurecr.io/setu/backend:previous-tag
```

### Data Rollback

If JSONL log is corrupted:
1. Download latest JSONL from Blob Storage cold tier
2. Replace local JSONL
3. Restart container app

---

## 8. Security Considerations

| Concern | Mitigation |
|---------|------------|
| Data at rest | Azure Storage Service Encryption (SSE) with Microsoft-managed keys |
| Data in transit | TLS 1.2+ enforced via Azure Front Door TLS termination |
| Secrets | Azure Key Vault for connection strings and API keys |
| Network isolation | Azure Front Door WAF rules, Container Apps environment networking |
| Access control | Azure RBAC for resource management, no public access to Blob Storage |
| Audit logging | Azure Monitor activity logs for all management operations |

---

## 9. Monitoring and Alerting

| Metric | Alert Threshold | Action |
|--------|---------------|--------|
| HTTP 5xx errors | > 5% for 5 minutes | Page on-call |
| Response time (p95) | > 2 seconds for 5 minutes | Investigate |
| Event ingestion rate | < 1 event/min for 15 minutes | Check frontend connectivity |
| Container CPU | > 80% for 10 minutes | Scale up replicas |
| Container memory | > 80% for 10 minutes | Scale up memory |

---

## 10. Disaster Recovery

| Scenario | Recovery Action | RTO | RPO |
|----------|----------------|-----|-----|
| Single container failure | ACA auto-restarts container | < 30 seconds | 0 events |
| Region failure | Failover to secondary region via Front Door | < 5 minutes | Last JSONL upload |
| Accidental data deletion | Restore JSONL from Blob Storage cold tier | < 30 minutes | Last backup |
| Regional outage | Front Door traffic manager failover | < 5 minutes | Last JSONL upload |

---

## 11. Monthly Cost Summary (East US)

| Component | Monthly Cost (USD) |
|-----------|-------------------|
| Container Apps (vCPU + memory) | ~$48/month |
| Azure Blob Storage | ~$3.45/month |
| Azure Static Web Apps | ~$0/month (Free tier) |
| Azure Monitor | ~$2.58/month |
| **Total Estimated Monthly Cost** | **~$54/month** |

---

## 10. Comparison Summary

| Criterion | Azure Static Web Apps + Container Apps | Azure App Service |
|-----------|--------------------------------------|-------------------|
| **Backend Runtime** | Container (Docker) | Native Node.js or Container |
| **Frontend Hosting** | Static Web Apps (dedicated) | App Service or Static Web Apps |
| **JSONL Persistence** | Blob Storage (required for both) | Blob Storage (required for both) |
| **SSE Support** | ✅ Native | ✅ Native |
| **Polling Support** | ✅ Native | ✅ Native |
| **CORS** | ✅ Native | ✅ Native |
| **HTTPS** | ✅ Automatic | ✅ Automatic |
| **Cold Starts** | Container Apps: ~5-10s | Minimal (always-on) |
| **Availability SLA** | 99.95% (2+ replicas) | 99.95% (Standard) |
| **Estimated Monthly Cost** | ~$54/month | ~$65-85/month |
| **Deployment Complexity** | Medium (Docker + ACA) | Low-Medium (Git/ZIP/Docker) |
| **Rollback Complexity** | Medium (Revision-based) | Low (Deployment slots) |
| **Recommendation** | **RECOMMENDED** | Alternative |

### Recommendation Justification

**Azure Static Web Apps + Azure Container Apps** is the recommended architecture because:

1. **Cost-effective**: ~$54/month vs ~$65-85/month for App Service
2. **Purpose-built**: Static Web Apps is purpose-built for React frontend hosting; Container Apps is purpose-built for containerized backend
3. **Independent scaling**: Frontend and backend scale independently based on demand
4. **Modern architecture**: Container-based approach is more portable and future-proof
5. **Free tier available**: Static Web Apps free tier covers frontend hosting at no cost

**App Service** is a viable alternative if:
- The team prefers a simpler, single-platform deployment
- Cold start times are a critical concern
- The team is already familiar with App Service deployment patterns

---

## 11. Security Considerations

| Concern | Mitigation |
|---------|------------|
| Data at rest | Azure Storage Service Encryption (SSE) with Microsoft-managed keys |
| Data in transit | TLS 1.2+ enforced via Azure Front Door TLS termination |
| Secrets | Azure Key Vault for connection strings and API keys |
| Network isolation | Azure Front Door WAF rules, Container Apps environment networking |
| Access control | Azure RBAC for resource management, no public access to Blob Storage |
| Audit logging | Azure Monitor activity logs for all management operations |

---

## 12. Next Steps (Require User Approval)

Before any resources are created:

1. **Approve Azure resource creation** — Confirm approval to create resources in the `a1ee9903-7c4d-4e4a-a18c-6283adfdfeb8` subscription
2. **Confirm region selection** — Confirm East US as the deployment region
3. **Approve budget** - Confirm ~$54/month estimated cost is acceptable
4. **Approve architecture** - Confirm Azure Static Web Apps + Container Apps architecture
5. **Provide Azure CLI login** - Ensure `az login` is authenticated with appropriate permissions

Once approved, the following resources will be created:
- Resource Group: `setu-rg` in East US
- Container Apps Environment: `setu-env-prod`
- Container App: `setu-api`
- Storage Account: `setueventlogs` (Cool tier)
- Static Web App: `setu-frontend`
- Application Insights: `setu-monitor`
- Log Analytics Workspace: `setu-log`
