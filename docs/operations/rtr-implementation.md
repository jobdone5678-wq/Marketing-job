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

### POST /api/rtr
Save a right-to-represent agreement.

The request is sent as **multipart form data**:

- `payload` — a JSON string with the agreement metadata
- `file` — the agreement document (optional, PNG/JPG/WEBP/PDF, up to 4 MB)

```json
{
  "candidate_id": "uuid (optional)",
  "candidate_name": "string",
  "submission_id": "uuid (optional - attach to an existing application)",
  "filename": "string",
  "mime_type": "string",
  "rtr_type": "vendor_rtr|client_rtr|direct_rtr",
  "rtr_status": "received|signed|expired|rejected",
  "rtr_date": "YYYY-MM-DD",
  "expiration_date": "YYYY-MM-DD",
  "company_name": "string",
  "job_title": "string",
  "notes": "string"
}
```

A plain JSON body is still accepted for metadata-only records.

Behaviour worth knowing:

- Dates are normalised to a real `YYYY-MM-DD` calendar date before they are written. OCR
  results such as `11/09/2026` or `Nov 9, 2026` are converted, and anything unreadable falls
  back to today instead of failing the insert.
- Uploading the same agreement again for the same candidate, client and role updates the
  existing application row instead of creating a second one.
- The response contains `submission_id`, `id`, `candidate_id`, `submission_created`,
  `submission_reused` and a `warnings` array. A write that did not succeed is reported as an
  error; the endpoint never reports a success for a record it could not store.

### GET /api/rtr
List RTR documents for submissions or candidates.

**Query Parameters:**
- `candidateId` - Filter by candidate
- `status` - Filter by agreement status
- `search` - Filter by candidate, company, vendor or file name

The document payload is not part of this response. Use `GET /api/rtr/[id]/document` to fetch
the file of a single agreement.

### GET /api/rtr/[id]/document
Return the stored file of one agreement (`url` or `base64` plus its filename and mime type).

### PATCH /api/rtr/[id]
Update RTR document status.

**Request Body:**
```json
{
  "rtr_status": "received|signed|expired|rejected",
  "notes": "string"
}
```

### DELETE /api/rtr/[id]
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