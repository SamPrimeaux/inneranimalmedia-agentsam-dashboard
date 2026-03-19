# Live dashboard API surface (from agent-sam R2)

Source: R2 bucket **agent-sam**, keys `dashboard/agent.html`, `dashboard/finance.html`, `dashboard/finance.js`, `dashboard/cloud.html`, `dashboard/cloud.js`. Fetched 2026-03-02.

---

## Finance (`finance.js`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/colors/all` | Provider/account/tenant/paymentSource colors for badges |
| GET | `/api/finance/summary?month=` | Income, expenses, net, tx_count for KPIs |
| GET | `/api/finance/transactions?month=&limit=&offset=&direction=&category=&account=&search=` | Paginated transaction list |
| GET | `/api/finance/breakdown?month=` | Category breakdown (debit/credit) |
| GET | `/api/finance/categories` | Category list for filters |
| GET | `/api/finance/accounts` | Account list for filters |
| GET | `/api/finance/health` | Financial health metrics |
| GET | `/api/finance/mrr` | MRR data |
| GET | `/api/finance/ai-spend` | AI/tools spend summary |
| POST | `/api/finance/transactions` | Create transaction |
| PUT | `/api/finance/transactions/:id` | Update transaction |
| DELETE | `/api/finance/transactions/:id` | Delete transaction |
| POST | `/api/finance/import` | Bulk import |
| POST | `/api/finance/import-preview` | Import preview |
| POST | `/api/finance/import-spend` | Import spend rows |
| POST | `/api/finance/import-spend-preview` | Spend import preview |
| POST | `/api/finance/enrich-csv` | Enrich CSV rows |
| POST | `/api/finance/agent-session` | Agent session prompt |
| PUT | `/api/finance/health/agency` | Update health agency notes |

**Response shapes (finance.js expects):**
- `summary`: `{ data?: { income, expenses, net, tx_count } }` or root `{ income, expenses, net, tx_count }`
- `transactions`: `{ data: array, total, offset?, limit? }`; each item: `id`, `direction`|`transaction_type`, `amount_cents`, `transaction_date`|`date`, `merchant`|`description`, `category`, `category_name`, `category_color`, `category_icon`, `account_id`, `account_name`, `bank_name`
- `health`: object with health metrics
- `colors/all`: `{ success, providers[], accounts[], tenants[], paymentSources[] }` with `slug`, `primary_color`, `text_on_color`, `display_name`, etc.

---

## Agent (`agent.html`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/agent/models` | Model list for dropdown |
| GET | `/api/agent/models?provider=` | Models by provider |
| GET | `/api/agent/context-refs` | Context references |
| GET | `/api/agent/preview?change_set_id=` | Preview change set |
| GET | `/api/agent/audit-log` | Audit log |
| POST | `/api/agent/apply-change-set` | Apply change set |
| POST | `/api/agent/change-set` | Create/update change set |
| POST | `/api/agent/save-draft` | Save draft |
| POST | `/api/agent/upload-attachment` | Upload attachment (FormData) |
| GET | `/api/agent/conversations` | List conversations |
| GET | `/api/agent/conversations/:id` | Get one conversation |
| POST | `/api/agent/chat` | Send message (streaming or JSON) |
| GET | `/api/finance/ai-spend?scope=agent` | Budget pie / usage for agent |
| GET | `/api/settings/theme` | Theme preference |
| POST | `/api/auth/logout` | Logout |

---

## Cloud (`cloud.js`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/cloud/r2/buckets` | List R2 buckets |
| GET | `/api/cloud/r2/buckets/:bucketName/objects` | List objects in bucket |
| GET | `/api/cloud/r2/preview?bucket=&key=` | Preview object (e.g. iframe src) |
| GET | `/api/dashboard/overview` | Overview stats (alternate to /api/overview/stats?) |
| GET | `/api/cloud/repositories` | Repositories list |
| POST | `/api/cloud/r2/refresh` | Refresh R2 metadata |
| GET | `/api/cloud/r2/buckets/:bucketName/inventory` | Bucket inventory |

---

## Worker routing (current)

- `/dashboard/:page` → DASHBOARD R2 key `static/dashboard/:page.html` or `dashboard/:page.html`
- So `/dashboard/finance` serves `dashboard/finance.html` from agent-sam (confirmed).
