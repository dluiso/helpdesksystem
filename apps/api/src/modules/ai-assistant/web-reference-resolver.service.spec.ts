import { WebReferenceResolverService, extractWebUrls, isAllowedUrl, isPrivateAddress, unwrapSafeLink } from "./web-reference-resolver.service";

describe("WebReferenceResolverService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("extracts direct URLs and unwraps Microsoft Safe Links", () => {
    const target = "https://www.example.com/services/audio";
    const safeLink = `https://nam12.safelinks.protection.outlook.com/?url=${encodeURIComponent(target)}&data=test`;
    const [url] = extractWebUrls(`Please update ${safeLink}.`);

    expect(unwrapSafeLink(url).toString()).toBe(target);
  });

  it("only allows exact client domains and their subdomains", () => {
    expect(isAllowedUrl(new URL("https://www.example.com/page"), ["example.com"])).toBe(true);
    expect(isAllowedUrl(new URL("https://example.com.evil.test/page"), ["example.com"])).toBe(false);
    expect(isAllowedUrl(new URL("ftp://example.com/page"), ["example.com"])).toBe(false);
  });

  it("rejects private, loopback, link-local, and mapped addresses", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("169.254.1.2")).toBe(true);
    expect(isPrivateAddress("100.64.0.1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("::ffff:192.168.1.10")).toBe(true);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });

  it("stores a bounded relevant excerpt for an approved public page", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(
      "<html><head><title>Community Services</title></head><body><script>ignore me</script><p>Parking pass instructions are available from the recreation office.</p></body></html>",
      { status: 200, headers: { "content-type": "text/html" } }
    ));
    const service = new WebReferenceResolverService();

    const result = await service.resolve({
      ticketContext: "Please update the parking pass instructions at https://93.184.216.34/services.",
      allowedDomains: ["93.184.216.34"]
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ status: "FOUND", title: "Community Services", source: "EXPLICIT_URL" });
    expect(result[0].excerpt).toContain("Parking pass instructions");
    expect(result[0].excerpt).not.toContain("ignore me");
  });

  it("keeps prompt reference IDs aligned with the persisted list", () => {
    const service = new WebReferenceResolverService();
    const prompt = service.formatForPrompt([
      { url: "https://blocked.test/", title: null, excerpt: null, matchedTerms: [], source: "EXPLICIT_URL", status: "BLOCKED", checkedAt: "2026-07-22T00:00:00.000Z", confidence: 0, reason: "Blocked" },
      { url: "https://example.com/page", title: "Page", excerpt: "Relevant copy", matchedTerms: ["copy"], source: "EXPLICIT_URL", status: "FOUND", checkedAt: "2026-07-22T00:00:00.000Z", confidence: 0.8, reason: null }
    ]);

    expect(prompt).toContain("[WEB-2] Page");
    expect(prompt).not.toContain("blocked.test");
  });

  it("detects a safe link from raw source text without adding signature text to the AI context", async () => {
    const target = "https://93.184.216.34/water-department/";
    const safeLink = `https://nam12.safelinks.protection.outlook.com/?url=${encodeURIComponent(target)}&data=mail-metadata`;
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(
      "<html><head><title>Water Department</title></head><body><p>Water service application request details.</p></body></html>",
      { status: 200, headers: { "content-type": "text/html" } }
    ));
    const service = new WebReferenceResolverService();

    const result = await service.resolve({
      ticketContext: "Please update the Water Department website.",
      sourceText: `Please update the website.\nBest regards,\nWebsite: ${safeLink}`,
      allowedDomains: ["93.184.216.34"]
    });

    expect(result[0]).toMatchObject({ url: target, status: "FOUND", title: "Water Department" });
    expect(service.formatForPrompt(result)).not.toContain("Best regards");
  });

  it("follows one sitemap index level to locate relevant pages", async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = input.toString();
      if (url.endsWith("/sitemap.xml")) {
        return new Response("<sitemapindex><sitemap><loc>https://93.184.216.34/wp-sitemap-posts-page-1.xml</loc></sitemap></sitemapindex>", { status: 200, headers: { "content-type": "application/xml" } });
      }
      if (url.endsWith("wp-sitemap-posts-page-1.xml")) {
        return new Response("<urlset><url><loc>https://93.184.216.34/departments/water-department/</loc></url></urlset>", { status: 200, headers: { "content-type": "application/xml" } });
      }
      return new Response("<html><head><title>Water Department</title></head><body><p>Water Department application and payment information.</p></body></html>", { status: 200, headers: { "content-type": "text/html" } });
    });
    const service = new WebReferenceResolverService();

    const result = await service.resolve({
      ticketContext: "Please update the Water Department website application information.",
      allowedDomains: ["93.184.216.34"]
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ url: "https://93.184.216.34/departments/water-department/", status: "FOUND", source: "SITEMAP" });
  });

  it("records blocked references without requesting them", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");
    const service = new WebReferenceResolverService();

    const result = await service.resolve({
      ticketContext: "Please update https://127.0.0.1/admin.",
      allowedDomains: ["127.0.0.1"]
    });

    expect(result[0]).toMatchObject({ status: "BLOCKED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
