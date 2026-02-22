#!/usr/bin/env node
/**
 * PandaDoc CLI - Secure Token Version
 * 
 * Uses the PAVE sandbox secure token system for authentication.
 * Tokens are never visible to sandbox code - they're injected by the host.
 * 
 * Token configuration in ~/.pave/permissions.yaml:
 * {
 *   "tokens": {
 *     "pandadoc": {
 *       "env": "PANDADOC_API_KEY",
 *       "type": "api_key",
 *       "domains": ["api.pandadoc.com"],
 *       "placement": {
 *         "type": "header",
 *         "name": "Authorization",
 *         "format": "API-Key {token}"
 *       }
 *     }
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments  
const args = process.argv.slice(2);

function parseArgs() {
  const parsed = {
    command: null,
    positional: [],
    options: {}
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=', 2);
        if (value !== undefined) {
          parsed.options[key] = value;
        } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          parsed.options[key] = args[i + 1];
          i++;
        } else {
          parsed.options[key] = true;
        }
      } else {
        const flag = arg.slice(1);
        if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
          parsed.options[flag] = args[i + 1];
          i++;
        } else {
          parsed.options[flag] = true;
        }
      }
    } else {
      if (parsed.command === null) {
        parsed.command = arg;
      } else {
        parsed.positional.push(arg);
      }
    }
  }
  
  return parsed;
}

// URL encoding function for sandbox compatibility
function encodeFormData(data) {
  const params = [];
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null && value !== '') {
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return params.join('&');
}

// Document status values
const DOCUMENT_STATUS = {
  DRAFT: 'document.draft',
  SENT: 'document.sent',
  COMPLETED: 'document.completed',
  UPLOADED: 'document.uploaded',
  ERROR: 'document.error',
  VIEWED: 'document.viewed',
  WAITING_APPROVAL: 'document.waiting_approval',
  APPROVED: 'document.approved',
  REJECTED: 'document.rejected',
  WAITING_PAY: 'document.waiting_pay',
  PAID: 'document.paid',
  VOIDED: 'document.voided',
  DECLINED: 'document.declined',
  EXTERNAL_REVIEW: 'document.external_review',
};

// Human-readable status names
const STATUS_LABELS = {
  'document.draft': 'Draft',
  'document.sent': 'Sent',
  'document.completed': 'Completed',
  'document.uploaded': 'Uploaded',
  'document.error': 'Error',
  'document.viewed': 'Viewed',
  'document.waiting_approval': 'Waiting Approval',
  'document.approved': 'Approved',
  'document.rejected': 'Rejected',
  'document.waiting_pay': 'Waiting Payment',
  'document.paid': 'Paid',
  'document.voided': 'Voided',
  'document.declined': 'Declined',
  'document.external_review': 'External Review',
};

// Status shorthand mapping
const STATUS_MAP = {
  draft: 'document.draft',
  sent: 'document.sent',
  completed: 'document.completed',
  viewed: 'document.viewed',
  approved: 'document.approved',
  rejected: 'document.rejected',
  voided: 'document.voided',
  declined: 'document.declined',
  paid: 'document.paid',
};

// PandaDoc Client Class - Uses secure token system
class PandaDocClient {
  constructor() {
    // Check if pandadoc token is available via secure token system
    if (typeof hasToken === 'function' && !hasToken('pandadoc')) {
      console.error('PandaDoc token not configured.');
      console.error('');
      console.error('Add to ~/.pave/permissions.yaml under tokens section:');
      console.error('');
      console.error('  pandadoc:');
      console.error('    env: PANDADOC_API_KEY');
      console.error('    type: api_key');
      console.error('    domains:');
      console.error('      - api.pandadoc.com');
      console.error('    placement:');
      console.error('      type: header');
      console.error('      name: Authorization');
      console.error('      format: "API-Key {token}"');
      console.error('');
      console.error('Then set environment variable:');
      console.error('  PANDADOC_API_KEY=your-api-key');
      console.error('');
      console.error('Get your API key from: https://app.pandadoc.com/a/#/settings/integrations/api');
      throw new Error('PandaDoc token not configured');
    }
    
    this.baseUrl = 'https://api.pandadoc.com/public/v1';
  }
  
  request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Use authenticatedFetch - token injection handled by sandbox
    const response = authenticatedFetch('pandadoc', url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      timeout: options.timeout || 15000
    });
    
    // Handle empty responses (204 No Content)
    if (response.status === 204) {
      return { success: true };
    }
    
    if (!response.ok) {
      const error = response.json();
      const err = new Error(error.detail || error.message || error.error || `HTTP ${response.status}`);
      err.status = response.status;
      err.data = error;
      throw err;
    }
    
    return response.json();
  }
  
  // Make request to v2 API
  requestV2(endpoint, options = {}) {
    const url = `https://api.pandadoc.com/public/v2${endpoint}`;
    
    const response = authenticatedFetch('pandadoc', url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      timeout: options.timeout || 15000
    });
    
    if (!response.ok) {
      const error = response.json();
      const err = new Error(error.detail || error.message || `HTTP ${response.status}`);
      err.status = response.status;
      err.data = error;
      throw err;
    }
    
    return response.json();
  }
  
  listDocuments(params = {}) {
    // Map params to API query params
    const paramMapping = {
      q: 'q',
      status: 'status',
      statusNe: 'status__ne',
      tag: 'tag',
      templateId: 'template_id',
      folderUuid: 'folder_uuid',
      count: 'count',
      page: 'page',
      orderBy: 'order_by',
      deleted: 'deleted',
      id: 'id',
      membership: 'membership',
      completedFrom: 'completed_from',
      completedTo: 'completed_to',
      createdFrom: 'created_from',
      createdTo: 'created_to',
      modifiedFrom: 'modified_from',
      modifiedTo: 'modified_to',
      contactId: 'contact_id',
    };
    
    const queryParams = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        const apiKey = paramMapping[key] || key;
        queryParams[apiKey] = value;
      }
    }
    
    const queryString = encodeFormData(queryParams);
    const endpoint = '/documents' + (queryString ? `?${queryString}` : '');
    
    return this.request(endpoint);
  }
  
  getDocumentStatus(documentId) {
    return this.request(`/documents/${documentId}`);
  }
  
  getDocumentDetails(documentId) {
    return this.request(`/documents/${documentId}/details`);
  }
  
  downloadDocument(documentId, options = {}) {
    const queryParams = {};
    if (options.watermark !== undefined) queryParams.watermark = options.watermark;
    if (options.separateFiles) queryParams.separate_files = options.separateFiles;
    
    const queryString = encodeFormData(queryParams);
    const url = `${this.baseUrl}/documents/${documentId}/download${queryString ? `?${queryString}` : ''}`;
    
    const response = authenticatedFetch('pandadoc', url, {
      timeout: 60000 // Longer timeout for downloads
    });
    
    if (!response.ok) {
      let errorData = {};
      try {
        errorData = response.json();
      } catch (e) {}
      const err = new Error(errorData.detail || errorData.message || 'Download failed');
      err.status = response.status;
      err.data = errorData;
      throw err;
    }
    
    return response.text();
  }
  
  downloadProtectedDocument(documentId) {
    const url = `${this.baseUrl}/documents/${documentId}/download-protected`;
    
    const response = authenticatedFetch('pandadoc', url, {
      timeout: 60000
    });
    
    if (!response.ok) {
      let errorData = {};
      try {
        errorData = response.json();
      } catch (e) {}
      const err = new Error(errorData.detail || errorData.message || 'Download failed');
      err.status = response.status;
      err.data = errorData;
      throw err;
    }
    
    return response.text();
  }
  
  sendDocument(documentId, options = {}) {
    return this.request(`/documents/${documentId}/send`, {
      method: 'POST',
      body: JSON.stringify(options)
    });
  }
  
  listTemplates(params = {}) {
    const queryParams = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        // Convert camelCase to snake_case
        const apiKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        queryParams[apiKey] = value;
      }
    }
    
    const queryString = encodeFormData(queryParams);
    const endpoint = '/templates' + (queryString ? `?${queryString}` : '');
    
    return this.request(endpoint);
  }
  
  listDocumentFolders(params = {}) {
    const queryString = encodeFormData(params);
    const endpoint = '/documents/folders' + (queryString ? `?${queryString}` : '');
    
    return this.request(endpoint);
  }
  
  getCurrentMember() {
    return this.request('/members/current');
  }
  
  getDocumentAuditTrail(documentId) {
    // Note: Audit trail uses v2 API
    return this.requestV2(`/documents/${documentId}/audit-trail`);
  }
  
  listDocumentFields(documentId) {
    return this.request(`/documents/${documentId}/fields`);
  }
}

// Format helpers
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return dateStr;
  }
}

function formatDocument(doc) {
  const status = STATUS_LABELS[doc.status] || doc.status;
  const created = formatDate(doc.date_created);
  const modified = formatDate(doc.date_modified);
  
  let output = `${doc.name}\n`;
  output += `  ID: ${doc.id}\n`;
  output += `  Status: ${status}\n`;
  output += `  Created: ${created}\n`;
  output += `  Modified: ${modified}\n`;
  
  if (doc.date_completed) {
    output += `  Completed: ${formatDate(doc.date_completed)}\n`;
  }
  
  if (doc.expiration_date) {
    output += `  Expires: ${formatDate(doc.expiration_date)}\n`;
  }
  
  if (doc.version) {
    output += `  Version: ${doc.version}\n`;
  }
  
  return output;
}

function formatDocumentDetails(doc) {
  const status = STATUS_LABELS[doc.status] || doc.status;
  
  let output = `# ${doc.name}\n\n`;
  output += `**ID:** ${doc.id}\n`;
  output += `**Status:** ${status}\n`;
  output += `**Created:** ${formatDate(doc.date_created)}\n`;
  output += `**Modified:** ${formatDate(doc.date_modified)}\n`;
  
  if (doc.date_completed) {
    output += `**Completed:** ${formatDate(doc.date_completed)}\n`;
  }
  
  if (doc.expiration_date) {
    output += `**Expires:** ${formatDate(doc.expiration_date)}\n`;
  }
  
  // Recipients
  if (doc.recipients && doc.recipients.length > 0) {
    output += `\n## Recipients (${doc.recipients.length})\n`;
    for (const recipient of doc.recipients) {
      const recipientStatus = recipient.has_completed ? 'Completed' : 
                              recipient.is_sender ? 'Sender' : 'Pending';
      output += `- ${recipient.first_name} ${recipient.last_name} <${recipient.email}> [${recipient.role || 'Recipient'}] - ${recipientStatus}\n`;
    }
  }
  
  // Tokens/Fields summary
  if (doc.tokens && doc.tokens.length > 0) {
    output += `\n## Fields (${doc.tokens.length})\n`;
    for (const token of doc.tokens.slice(0, 10)) {
      const value = token.value !== undefined && token.value !== '' ? token.value : '(empty)';
      output += `- ${token.name}: ${value}\n`;
    }
    if (doc.tokens.length > 10) {
      output += `  ... and ${doc.tokens.length - 10} more fields\n`;
    }
  }
  
  // Grand total if present
  if (doc.grand_total) {
    output += `\n**Grand Total:** ${doc.grand_total.currency || 'USD'} ${doc.grand_total.amount}\n`;
  }
  
  return output;
}

function printHelp() {
  console.log(`
PandaDoc CLI - Secure Token Version

USAGE:
  pandadoc <command> [options]

COMMANDS:
  list [options]              List documents with optional filters
  get <documentId>            Get document status
  details <documentId>        Get detailed document info (recipients, fields)
  download <documentId>       Download document as PDF
  templates [options]         List templates
  folders [options]           List document folders
  me                          Get current user info
  audit <documentId>          Get document audit trail
  fields <documentId>         List document fields
  send <documentId>           Send document for signing

LIST OPTIONS:
  -q, --query <query>         Search query
  -s, --status <status>       Filter by status (draft, sent, completed, viewed, etc.)
  -t, --tag <tag>             Filter by tag
  --template <templateId>     Filter by template ID
  --folder <folderUuid>       Filter by folder UUID
  -n, --count <count>         Number of results (max 100, default 50)
  -p, --page <page>           Page number (default 1)
  --order <field>             Sort by field (name, date_created, date_modified, date_completed)
  --deleted                   Include deleted documents
  --created-from <date>       Created after (YYYY-MM-DD)
  --created-to <date>         Created before (YYYY-MM-DD)
  --modified-from <date>      Modified after (YYYY-MM-DD)
  --modified-to <date>        Modified before (YYYY-MM-DD)
  --completed-from <date>     Completed after (YYYY-MM-DD)
  --completed-to <date>       Completed before (YYYY-MM-DD)

DOWNLOAD OPTIONS:
  -o, --output <file>         Output file path (default: tmp/<doc-name>.pdf)
  --watermark                 Include watermark for drafts
  --protected                 Download completed document with certificate

SEND OPTIONS:
  -m, --message <message>     Custom message for recipients
  --subject <subject>         Custom email subject
  --silent                    Don't send email notifications

OUTPUT OPTIONS:
  --json                      Output raw JSON
  --summary                   Output human-readable summary

EXAMPLES:
  pandadoc list --summary
  pandadoc list --status sent --count 20 --summary
  pandadoc get abc123 --summary
  pandadoc details abc123 --summary
  pandadoc download abc123 -o tmp/contract.pdf
  pandadoc templates --summary
  pandadoc me --summary
  pandadoc send abc123 --message "Please sign"

TOKEN SETUP:
  Add to ~/.pave/permissions.yaml under tokens:

    pandadoc:
      env: PANDADOC_API_KEY
      type: api_key
      domains:
        - api.pandadoc.com
      placement:
        type: header
        name: Authorization
        format: "API-Key {token}"

  Then set environment variable:
    PANDADOC_API_KEY=your-api-key

  Get your API key from: https://app.pandadoc.com/a/#/settings/integrations/api
`);
}

// Main execution function
function main() {
  const parsed = parseArgs();
  
  if (!parsed.command || parsed.command === 'help' || parsed.options.help || parsed.options.h) {
    printHelp();
    return;
  }
  
  try {
    const client = new PandaDocClient();
    
    switch (parsed.command) {
      case 'list': {
        const params = {};
        if (parsed.options.q || parsed.options.query) params.q = parsed.options.q || parsed.options.query;
        if (parsed.options.s || parsed.options.status) {
          const status = parsed.options.s || parsed.options.status;
          params.status = STATUS_MAP[status.toLowerCase()] || status;
        }
        if (parsed.options.t || parsed.options.tag) params.tag = parsed.options.t || parsed.options.tag;
        if (parsed.options.template) params.templateId = parsed.options.template;
        if (parsed.options.folder) params.folderUuid = parsed.options.folder;
        if (parsed.options.n || parsed.options.count) params.count = parsed.options.n || parsed.options.count;
        if (parsed.options.p || parsed.options.page) params.page = parsed.options.p || parsed.options.page;
        if (parsed.options.order) params.orderBy = parsed.options.order;
        if (parsed.options.deleted) params.deleted = true;
        if (parsed.options['created-from']) params.createdFrom = parsed.options['created-from'];
        if (parsed.options['created-to']) params.createdTo = parsed.options['created-to'];
        if (parsed.options['modified-from']) params.modifiedFrom = parsed.options['modified-from'];
        if (parsed.options['modified-to']) params.modifiedTo = parsed.options['modified-to'];
        if (parsed.options['completed-from']) params.completedFrom = parsed.options['completed-from'];
        if (parsed.options['completed-to']) params.completedTo = parsed.options['completed-to'];
        
        const result = client.listDocuments(params);
        
        if (parsed.options.summary) {
          const docs = result.results || [];
          console.log(`Found ${docs.length} document(s)\n`);
          for (const doc of docs) {
            console.log(formatDocument(doc));
          }
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }
      
      case 'get': {
        const documentId = parsed.positional[0];
        if (!documentId) {
          console.error('Error: Document ID required');
          console.error('Usage: pandadoc get <documentId>');
          process.exit(1);
        }
        
        const result = client.getDocumentStatus(documentId);
        
        if (parsed.options.summary) {
          console.log(formatDocument(result));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }
      
      case 'details': {
        const documentId = parsed.positional[0];
        if (!documentId) {
          console.error('Error: Document ID required');
          console.error('Usage: pandadoc details <documentId>');
          process.exit(1);
        }
        
        const result = client.getDocumentDetails(documentId);
        
        if (parsed.options.summary) {
          console.log(formatDocumentDetails(result));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }
      
      case 'download': {
        const documentId = parsed.positional[0];
        if (!documentId) {
          console.error('Error: Document ID required');
          console.error('Usage: pandadoc download <documentId> [-o output.pdf]');
          process.exit(1);
        }
        
        // Get document info for default filename
        let outputPath = parsed.options.o || parsed.options.output;
        if (!outputPath) {
          const docInfo = client.getDocumentStatus(documentId);
          const safeName = docInfo.name.replace(/[^a-zA-Z0-9-_]/g, '_');
          outputPath = `tmp/${safeName}.pdf`;
        }
        
        // Ensure directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        let content;
        if (parsed.options.protected) {
          content = client.downloadProtectedDocument(documentId);
        } else {
          content = client.downloadDocument(documentId, {
            watermark: parsed.options.watermark
          });
        }
        
        fs.writeFileSync(outputPath, content);
        console.log(`Downloaded to: ${outputPath}`);
        break;
      }
      
      case 'templates': {
        const params = {};
        if (parsed.options.q || parsed.options.query) params.q = parsed.options.q || parsed.options.query;
        if (parsed.options.t || parsed.options.tag) params.tag = parsed.options.t || parsed.options.tag;
        if (parsed.options.n || parsed.options.count) params.count = parsed.options.n || parsed.options.count;
        if (parsed.options.p || parsed.options.page) params.page = parsed.options.p || parsed.options.page;
        if (parsed.options.deleted) params.deleted = true;
        
        const result = client.listTemplates(params);
        
        if (parsed.options.summary) {
          const templates = result.results || [];
          console.log(`Found ${templates.length} template(s)\n`);
          for (const tmpl of templates) {
            console.log(`${tmpl.name}`);
            console.log(`  ID: ${tmpl.id}`);
            console.log(`  Created: ${formatDate(tmpl.date_created)}`);
            console.log(`  Modified: ${formatDate(tmpl.date_modified)}`);
            if (tmpl.tags && tmpl.tags.length > 0) {
              console.log(`  Tags: ${tmpl.tags.join(', ')}`);
            }
            console.log();
          }
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }
      
      case 'folders': {
        const params = {};
        if (parsed.options.parent) params.parent_uuid = parsed.options.parent;
        if (parsed.options.n || parsed.options.count) params.count = parsed.options.n || parsed.options.count;
        if (parsed.options.p || parsed.options.page) params.page = parsed.options.p || parsed.options.page;
        
        const result = client.listDocumentFolders(params);
        
        if (parsed.options.summary) {
          const folders = result.results || [];
          console.log(`Found ${folders.length} folder(s)\n`);
          for (const folder of folders) {
            console.log(`${folder.name}`);
            console.log(`  UUID: ${folder.uuid}`);
            console.log(`  Created: ${formatDate(folder.date_created)}`);
            console.log();
          }
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }
      
      case 'me': {
        const result = client.getCurrentMember();
        
        if (parsed.options.summary) {
          console.log(`${result.first_name} ${result.last_name}`);
          console.log(`  Email: ${result.email}`);
          console.log(`  Member ID: ${result.id}`);
          if (result.workspace) {
            console.log(`  Workspace: ${result.workspace.name}`);
          }
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }
      
      case 'audit': {
        const documentId = parsed.positional[0];
        if (!documentId) {
          console.error('Error: Document ID required');
          console.error('Usage: pandadoc audit <documentId>');
          process.exit(1);
        }
        
        const result = client.getDocumentAuditTrail(documentId);
        
        if (parsed.options.summary) {
          const events = result.results || result.events || [];
          console.log(`Audit Trail (${events.length} events)\n`);
          for (const event of events) {
            const date = formatDate(event.date || event.timestamp);
            const actor = event.actor?.email || event.user_email || 'System';
            console.log(`${date} - ${event.event_type || event.action}`);
            console.log(`  By: ${actor}`);
            if (event.details || event.description) {
              console.log(`  ${event.details || event.description}`);
            }
            console.log();
          }
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }
      
      case 'fields': {
        const documentId = parsed.positional[0];
        if (!documentId) {
          console.error('Error: Document ID required');
          console.error('Usage: pandadoc fields <documentId>');
          process.exit(1);
        }
        
        const result = client.listDocumentFields(documentId);
        
        if (parsed.options.summary) {
          const fields = result.fields || [];
          console.log(`Document Fields (${fields.length})\n`);
          for (const field of fields) {
            const value = field.value !== undefined && field.value !== '' ? field.value : '(empty)';
            console.log(`${field.name}: ${value}`);
          }
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }
      
      case 'send': {
        const documentId = parsed.positional[0];
        if (!documentId) {
          console.error('Error: Document ID required');
          console.error('Usage: pandadoc send <documentId> [--message "..."] [--subject "..."]');
          process.exit(1);
        }
        
        const sendOptions = {};
        if (parsed.options.m || parsed.options.message) {
          sendOptions.message = parsed.options.m || parsed.options.message;
        }
        if (parsed.options.subject) {
          sendOptions.subject = parsed.options.subject;
        }
        if (parsed.options.silent) {
          sendOptions.silent = true;
        }
        
        const result = client.sendDocument(documentId, sendOptions);
        
        if (parsed.options.summary) {
          console.log(`Document sent successfully!`);
          console.log(`  Document ID: ${documentId}`);
          if (result.status) {
            console.log(`  Status: ${STATUS_LABELS[result.status] || result.status}`);
          }
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }
      
      default:
        console.error(`Error: Unknown command '${parsed.command}'`);
        console.error('\nRun: pandadoc help');
        process.exit(1);
    }
    
  } catch (error) {
    if (parsed.options.summary) {
      console.error(`PandaDoc Error: ${error.message}`);
      if (process.env.DEBUG) {
        console.error('Stack trace:', error.stack);
      }
    } else {
      console.error(JSON.stringify({
        error: error.message,
        status: error.status,
        data: error.data
      }, null, 2));
    }
    process.exit(1);
  }
}

// Execute
main();
