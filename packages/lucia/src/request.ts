const HTTP_PREFIX_RE = /^https?:\/\//i;

export function verifyRequestOrigin(origin: string, allowedDomains: string[]): boolean {
	if (!origin || allowedDomains.length < 1) {
		return false;
	}

	const originHost = safeURL(origin)?.host;
	if (!originHost) {
		return false;
	}

	return allowedDomains.some((rawDomain) => {
		const domain = HTTP_PREFIX_RE.test(rawDomain) ? rawDomain : `https://${rawDomain}`;

		return originHost === safeURL(domain)?.host;
	});
}

function safeURL(url: URL | string): URL | null {
	try {
		return new URL(url);
	} catch {
		return null;
	}
}
