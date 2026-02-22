# openpave-pandadoc

📝 PandaDoc skill for OpenPAVE - Query and manage PandaDoc documents, templates, and e-signatures securely.

## Installation

```bash
# From local directory
pave install ~/path/to/openpave-pandadoc

# From GitHub
pave install cnrai/openpave-pandadoc
```

## Setup

### 1. Get Your PandaDoc API Key

1. Log in to [PandaDoc](https://app.pandadoc.com/)
2. Go to **Settings** → **Integrations** → **API**
3. Create a new API key or copy your existing one

### 2. Configure the Token

Add to `~/.pave/permissions.yaml` under the `tokens` section:

```yaml
tokens:
  pandadoc:
    env: PANDADOC_API_KEY
    type: api_key
    domains:
      - api.pandadoc.com
    placement:
      type: header
      name: Authorization
      format: "API-Key {token}"
```

### 3. Set Environment Variable

Add to your `.env` file or `~/.pave/tokens.yaml`:

```bash
PANDADOC_API_KEY=your-api-key-here
```

## Usage

```bash
# Get current user info
pandadoc me --summary

# List recent documents
pandadoc list --summary
pandadoc list --count 20 --summary

# Filter by status
pandadoc list --status completed --summary
pandadoc list --status draft --summary
pandadoc list --status sent --summary

# Search documents
pandadoc list --query "invoice" --summary

# Filter by date range
pandadoc list --created-from 2026-01-01 --created-to 2026-01-31 --summary

# Get document status
pandadoc get <documentId> --summary

# Get document details (includes recipients, fields, totals)
pandadoc details <documentId> --summary

# Download document as PDF
pandadoc download <documentId>                    # Saves to tmp/<name>.pdf
pandadoc download <documentId> -o tmp/custom.pdf  # Custom output path
pandadoc download <documentId> --protected        # With certificate (completed docs)

# List templates
pandadoc templates --summary
pandadoc templates --query "quote" --summary

# List folders
pandadoc folders --summary

# Get document audit trail
pandadoc audit <documentId> --summary

# Get document fields
pandadoc fields <documentId> --summary

# Send document for signing
pandadoc send <documentId>
pandadoc send <documentId> --message "Please sign" --subject "Contract Ready"
```

## Commands

| Command | Description |
|---------|-------------|
| `list` | List documents with optional filters |
| `get <id>` | Get document status by ID |
| `details <id>` | Get detailed document info (recipients, fields, totals) |
| `download <id>` | Download document as PDF |
| `templates` | List templates |
| `folders` | List document folders |
| `me` | Get current user/member info |
| `audit <id>` | Get document audit trail |
| `fields <id>` | List document fields/tokens |
| `send <id>` | Send document for signing |

## List Options

| Option | Description |
|--------|-------------|
| `-q, --query <query>` | Search query |
| `-s, --status <status>` | Filter by status (draft, sent, completed, viewed, etc.) |
| `-t, --tag <tag>` | Filter by tag |
| `--template <id>` | Filter by template ID |
| `--folder <uuid>` | Filter by folder UUID |
| `-n, --count <count>` | Number of results (max 100) |
| `-p, --page <page>` | Page number |
| `--order <field>` | Sort by: name, date_created, date_modified, date_completed |
| `--deleted` | Include deleted documents |
| `--created-from/to` | Filter by creation date |
| `--modified-from/to` | Filter by modification date |
| `--completed-from/to` | Filter by completion date |

## Document Status Values

| Status | Description |
|--------|-------------|
| `draft` | Document in draft |
| `sent` | Sent for signing |
| `completed` | All signatures collected |
| `viewed` | Viewed by recipient |
| `approved` | Approved |
| `rejected` | Rejected |
| `voided` | Voided by sender |
| `declined` | Declined by recipient |
| `paid` | Payment received |

## Output Options

| Option | Description |
|--------|-------------|
| `--json` | Output raw JSON |
| `--summary` | Output human-readable summary |

## Security

This skill uses the PAVE sandbox secure token system:
- API keys are **never exposed** to the skill code
- Network access is restricted to PandaDoc API domain only
- File operations are limited to the `tmp/` directory

## Safety

**Note:** Document deletion is not supported in this skill for safety reasons. To delete documents, use the PandaDoc web interface directly.

## API Reference

- [PandaDoc API Documentation](https://developers.pandadoc.com/reference/about)

## License

MIT
