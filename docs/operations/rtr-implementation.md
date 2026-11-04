# RTR (Right to Represent) Implementation

## Overview

The RTR (Right to Represent) feature allows vendors and companies to send Right to Represent documents when a candidate applies for a job. These documents are stored in the platform and can be tracked, managed, and associated with job submissions.

## Database Schema Changes

### New Table: `rtr_documents`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| submission_id | UUID | References job_submissions |
| candidate_id | UUID | References candidates |
| filename | TEXT | Original filename |
| mime_type | TEXT | Document MIME type |
| base64 | TEXT | Base64 encoded document content |
| document_url | TEXT | URL to stored document (optional) |
| vendor_id | UUID | References vendors (optional) |
| vendor_name | TEXT | Name of the vendor/client sending RTR |
| vendor_contact_name | TEXT | Contact person name |
| vendor_contact_email | TEXT | Contact email |
| vendor_contact_phone | TEXT | Contact phone |
| rtr_type | TEXT | Type: vendor_rtr, client_rtr, direct_rtr |
| rtr_status | TEXT | Status: received, signed, expired, rejected |
| rtr_date | DATE | Date RTR was sent/received |
| expiration_date | DATE | RTR validity period |
| notes | TEXT | Additional notes |
| uploaded_by | UUID | Profile who uploaded the RTR |

### Modified Table: `job_submissions`

Added `rtr_document` JSONB column to store a reference to the latest RTR:
```json
{
  "id": "uuid",
  "filename": "RTR - Company Name.pdf",
  "mime_type": "application/pdf",
  "vendor_name": "Vendor Company Inc.",
  "rtr_type": "vendor_rtr",
  "rtr_status": "received",
  "rtr_date": "2026-11-04",
  "expiration_date": "2026-12-04",
  "created_at": "2026-11-04T10:30:00Z"
}
```

## API Endpoints

### POST /api/rtr-documents
Upload a new RTR document.

**Request Body:**
```json
{
  "submissionId": "uuid",
  "candidateId": "uuid",
  "filename": "string",
  "mimeType": "string",
  "base64": "string (optional)",
  "vendorName": "string (optional)",
  "vendorContactName": "string (optional)",
  "vendorContactEmail": "string (optional)",
  "vendorContactPhone": "string (optional)",
  "rtrType": "vendor_rtr|client_rtr|direct_rtr",
  "rtrStatus": "received|signed|expired|rejected",
  "rtrDate": "YYYY-MM-DD",
  "expirationDate": "YYYY-MM-DD",
  "notes": "string"
}
```

### GET /api/rtr-documents
List RTR documents for submissions or candidates.

**Query Parameters:**
- `submissionId` - Filter by submission
- `candidateId` - Filter by candidate

### PATCH /api/rtr-documents/[id]
Update RTR document status.

**Request Body:**
```json
{
  "rtrStatus": "received|signed|expired|rejected",
  "notes": "string"
}
```

### DELETE /api/rtr-documents/[id]
Delete an RTR document.

## Frontend Components

### RTRBadge Component
Displays RTR status information in the submissions table. Shows:
- RTR document filename
- Status badge (Received, Signed, Expired, Rejected)
- Vendor name
- Expiration date (if applicable)

### RTRManager Component
Full RTR management interface including:
- Upload new RTR documents
- View all RTRs for a submission
- Update RTR status
- Delete RTR documents
- Preview RTR details

## Usage Flow

1. **Candidate applies for a job** - Create/update a job submission
2. **Vendor sends RTR** - Recruiter uploads the RTR document via:
   - Dashboard: `/dashboard/submissions/[id]/edit`
   - Bulk upload via the RTRManager component
   - Browser extension: POST /api/extension/rtr-upload
3. **Track RTR status** - RTR documents appear in:
   - Submissions table column
   - Submission detail view
   - Export reports (CSV/Excel)
   - Daily standup report
4. **Update status** - Change RTR status from "Received" to "Signed" when confirmed
5. **Manage expiration** - Review and update expiration dates

## Browser Extension Integration

The browser extension can upload RTR documents using:

```javascript
await fetch('https://your-app.com/api/extension/rtr-upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${extension_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    submissionId: 'uuid',
    candidateId: 'uuid',
    filename: 'RTR_Vendor_Company.pdf',
    mimeType: 'application/pdf',
    base64: 'base64-encoded-document',
    vendorName: 'Vendor Company',
    rtrType: 'vendor_rtr',
    rTRStatus: 'received'
  })
});
```

## Database Functions

### save_rtr_document
Stored procedure to save RTR documents with proper ACL checks.

```sql
SELECT public.save_rtr_document(
  p_actor => uuid,
  p_submission => uuid,
  p_candidate => uuid,
  p_filename => text,
  p_mime_type => text,
  p_base64 => text,
  p_vendor_id => uuid,
  p_vendor_name => text,
  p_vendor_contact_name => text,
  p_vendor_contact_email => text,
  p_vendor_contact_phone => text,
  p_rtr_type => text,
  p_rtr_status => text,
  p_rtr_date => date,
  p_expiration_date => date,
  p_notes => text
) RETURNS jsonb;
```

### update_rtr_status
Update RTR document status.

```sql
SELECT public.update_rtr_status(
  p_actor => uuid,
  p_rtr_id => uuid,
  p_rtr_status => text,
  p_notes => text
) RETURNS jsonb;
```

## Migration

Apply the migration:

```sql
-- Path: supabase/migrations/20261104000100_rtr_documents.sql
-- Apply via Supabase SQL editor or CLI
```

## Verification Checklist

- [ ] Database migration applied successfully
- [ ] API endpoints working (POST, GET, PATCH, DELETE)
- [ ] RTR documents visible in submissions table
- [ ] RTR badge displays correctly
- [ ] CSV export includes RTR columns
- [ ] Daily report includes RTR information
- [ ] RLS policies working correctly
- [ ] Audit events recorded for RTR actions
- [ ] Browser extension upload endpoint functional

## Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| received | RTR document received but not yet verified | Review, add details |
| signed | RTR signed and valid | Active tracking |
| expired | RTR past expiration date | Notify team, request new RTR |
| rejected | RTR not valid/approved | Remove or mark invalid |

## RTR Types

| Type | Description |
|------|-------------|
| vendor_rtr | RTR from staffing/vendor company |
| client_rtr | Direct RTR from end client |
| direct_rtr | RTR sent directly by candidate