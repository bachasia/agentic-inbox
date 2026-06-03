# WooCommerce REST API v3 — Cloudflare Workers Integration Reference

## Authentication

**Method:** HTTP Basic Auth (HTTPS required)  
**Header:** `Authorization: Basic {base64(consumer_key:consumer_secret)}`  
**Alt (if headers fail):** Query params `?consumer_key=KEY&consumer_secret=SECRET` (HTTPS only)

```javascript
// Cloudflare Workers example
const auth = btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`);
const headers = {
  'Authorization': `Basic ${auth}`,
  'Content-Type': 'application/json'
};
```

---

## Orders Endpoint

**Base URL:** `https://your-site.com/wp-json/wc/v3/orders`

### Fetch Orders — Query Parameters

| Parameter | Type | Notes |
|-----------|------|-------|
| `customer_email` | string | Email filter (if unsupported, use customer lookup first) |
| `customer` | int | Customer ID (recommended when email known) |
| `status` | string | pending, processing, on-hold, completed, cancelled, refunded, failed |
| `per_page` | int | Default: 10, Max: 100 |
| `page` | int | Pagination cursor (1-indexed) |
| `orderby` | string | date, id, title, modified |
| `order` | string | asc, desc |

**Example Request:**
```
GET https://your-site.com/wp-json/wc/v3/orders?customer_email=user@example.com&per_page=10&orderby=date&order=desc
Authorization: Basic {credentials}
```

---

## Order Response Schema (Minimal)

```json
{
  "id": 1234,
  "number": "1001",
  "status": "completed",
  "total": "29.99",
  "currency": "USD",
  "date_created": "2024-05-15T10:30:00",
  "customer_id": 42,
  "billing": {
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe"
  },
  "shipping": {
    "address_1": "123 Main St",
    "city": "Springfield",
    "state": "IL",
    "postcode": "62701",
    "country": "US"
  },
  "payment_method": "stripe",
  "payment_method_title": "Credit Card",
  "line_items": [
    {
      "id": 5678,
      "name": "Product Name",
      "product_id": 99,
      "quantity": 2,
      "subtotal": "20.00",
      "total": "20.00",
      "price": "10.00",
      "meta_data": []
    }
  ],
  "meta_data": [
    {
      "id": 888,
      "key": "_wc_shipment_tracking_items",
      "value": [
        {
          "tracking_number": "1Z999AA10123456784",
          "tracking_provider": "ups",
          "custom_tracking_provider": null,
          "custom_tracking_link": null,
          "date_shipped": "2024-05-16"
        }
      ]
    }
  ]
}
```

---

## Advanced Shipment Tracking (AST) Meta Key

**Key:** `_wc_shipment_tracking_items`  
**Type:** Array of objects

```json
{
  "tracking_number": "string",
  "tracking_provider": "ups|fedex|dhl|usps|etc",
  "custom_tracking_provider": "string|null",
  "custom_tracking_link": "string|null",
  "date_shipped": "YYYY-MM-DD"
}
```

---

## Pagination

- **Response Headers:** `X-WP-Total` (total records), `X-WP-TotalPages` (pages)
- **Link Header:** includes `rel="next"` and `rel="prev"` URLs
- **Recommendation:** Follow Link headers instead of building custom URLs

---

## Rate Limits

- **Store API:** 25 requests per 10 seconds (configurable via filter)
- **REST API v3:** No documented hard limit; follows WordPress/server capabilities
- **Best Practice:** Implement exponential backoff on 429 responses

---

## Error Responses

All errors return consistent format:

```json
{
  "code": "error_code_slug",
  "message": "Human-readable message",
  "data": { "status": 401 }
}
```

**Common Codes:**
- `woocommerce_rest_authentication_error` → Invalid credentials (401)
- `woocommerce_rest_cannot_view` → Missing read permission (401)
- `rest_no_route` → Endpoint not found (404)
- `woocommerce_rest_term_invalid` → Resource doesn't exist (404)

---

## Implementation Checklist

- [ ] Use HTTPS only
- [ ] Generate API keys with `Read` permission minimum
- [ ] Implement retry logic with exponential backoff
- [ ] Parse `X-WP-Total` header for pagination
- [ ] Handle 404 on customer not found (email filter may not exist)
- [ ] Fallback: Look up customer by email via `/wp-json/wc/v3/customers?search=email` first
- [ ] Extract tracking from `meta_data` array, key `_wc_shipment_tracking_items`

---

## Unresolved Questions

1. **Customer email filter:** Confirmed `customer_email` param exists in docs, but some sources suggest using customer ID after lookup. Need clarification on whether query-by-email is directly supported or requires two-step lookup.
2. **Rate limit specifics:** REST API v3 rate limits not explicitly documented; may vary by host/plan. Store API limits documented but may not apply to REST API.
3. **Protected meta_data:** Docs mention `filter=true` parameter for protected metadata (prefixed `_`), but unclear if this applies to `_wc_shipment_tracking_items` retrieval.

---

## Sources

- [WooCommerce REST API v3 Documentation](https://developer.woocommerce.com/docs/apis/rest-api/v3/)
- [REST API Authentication Guide](https://developer.woocommerce.com/docs/apis/rest-api/authentication/)
- [WooCommerce REST API GitHub Docs (Orders)](https://github.com/woocommerce/woocommerce-rest-api-docs/blob/trunk/source/includes/wp-api-v3/_orders.md)
- [Advanced Shipment Tracking Pro Documentation](https://woocommerce.com/document/advanced-shipment-tracking-pro/)
- [Shipment Tracking Documentation](https://woocommerce.com/document/shipment-tracking/)
