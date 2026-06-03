const CACHE_NAME = "agentic-inbox-v1";
const API_CACHE = "agentic-inbox-api-v1";
const APP_SHELL = ["/", "/favicon.svg", "/favicon.ico"];
const MAX_API_ENTRIES = 200;

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
	);
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(
				keys
					.filter((k) => k !== CACHE_NAME && k !== API_CACHE)
					.map((k) => caches.delete(k))
			)
		)
	);
	self.clients.claim();
});

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const url = new URL(request.url);

	if (request.method !== "GET") return;
	if (url.pathname.startsWith("/agents/")) return;
	if (url.pathname.startsWith("/mcp")) return;
	if (url.pathname.includes("cdn-cgi")) return;

	if (url.pathname.startsWith("/api/")) {
		event.respondWith(networkFirst(request, API_CACHE));
		return;
	}

	event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
});

async function networkFirst(request, cacheName) {
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(cacheName);
			cache.put(request, response.clone());
			evictOldEntries(cacheName, MAX_API_ENTRIES);
		}
		return response;
	} catch {
		const cached = await caches.match(request);
		return cached || new Response('{"error":"offline"}', {
			status: 503,
			headers: { "Content-Type": "application/json" },
		});
	}
}

async function staleWhileRevalidate(request, cacheName) {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request);

	const fetchPromise = fetch(request)
		.then((response) => {
			if (response.ok) cache.put(request, response.clone());
			return response;
		})
		.catch(() => cached || new Response("", { status: 503, statusText: "Service Unavailable" }));

	return cached || fetchPromise;
}

async function evictOldEntries(cacheName, maxEntries) {
	const cache = await caches.open(cacheName);
	const keys = await cache.keys();
	if (keys.length > maxEntries) {
		const toDelete = keys.slice(0, keys.length - maxEntries);
		await Promise.all(toDelete.map((k) => cache.delete(k)));
	}
}
